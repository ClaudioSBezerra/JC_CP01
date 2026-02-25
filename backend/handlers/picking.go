package handlers

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// --- Dashboard ---

type PickingDashboard struct {
	Filiais        []FilialSummary `json:"filiais"`
	RecentWaves    []WaveSummary   `json:"recent_waves"`
	LastSyncAt     *string         `json:"last_sync_at"`
	NextSyncIn     int             `json:"next_sync_in_minutes"`
	PickingEnabled bool            `json:"picking_enabled"`
	UseMock        bool            `json:"use_mock_winthor"`
}

type FilialSummary struct {
	Filial         string  `json:"filial"`
	TotalLocations int     `json:"total_locations"`
	BelowMin       int     `json:"below_min"`
	HealthPct      float64 `json:"health_pct"`
	FragScore      float64 `json:"frag_score"`
	LastWaveAt     *string `json:"last_wave_at"`
}

type WaveSummary struct {
	ID          int     `json:"id"`
	Filial      string  `json:"filial"`
	WaveNumber  string  `json:"wave_number"`
	Status      string  `json:"status"`
	TotalTasks  int     `json:"total_tasks"`
	GeneratedAt string  `json:"generated_at"`
}

func GetPickingDashboardHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)

		var pickingEnabled bool
		var useMock bool
		var intervalMinutes int
		db.QueryRow(`
			SELECT COALESCE(picking_enabled,false), COALESCE(use_mock_winthor,true), COALESCE(sync_interval_minutes,30)
			FROM settings WHERE company_id = $1
		`, companyID).Scan(&pickingEnabled, &useMock, &intervalMinutes)

		// Last sync time
		var lastSyncAt sql.NullTime
		db.QueryRow(`
			SELECT MAX(synced_at) FROM winthor_sync_log WHERE company_id=$1 AND sync_type='stock_fetch' AND status='success'
		`, companyID).Scan(&lastSyncAt)

		var lastSyncStr *string
		var nextSyncIn int
		if lastSyncAt.Valid {
			s := lastSyncAt.Time.Format(time.RFC3339)
			lastSyncStr = &s
			elapsed := int(time.Since(lastSyncAt.Time).Minutes())
			remaining := intervalMinutes - elapsed
			if remaining < 0 {
				remaining = 0
			}
			nextSyncIn = remaining
		}

		// Per-filial summary
		filialRows, _ := db.Query(`
			SELECT filial,
			       COUNT(*) as total,
			       SUM(CASE WHEN current_qty <= min_qty AND min_qty > 0 THEN 1 ELSE 0 END) as below_min
			FROM picking_stock WHERE company_id=$1
			GROUP BY filial ORDER BY filial
		`, companyID)
		defer filialRows.Close()

		var filiais []FilialSummary
		for filialRows.Next() {
			var fs FilialSummary
			filialRows.Scan(&fs.Filial, &fs.TotalLocations, &fs.BelowMin)
			if fs.TotalLocations > 0 {
				fs.HealthPct = float64(fs.TotalLocations-fs.BelowMin) / float64(fs.TotalLocations) * 100
			}

			// Latest fragmentation score
			db.QueryRow(`
				SELECT COALESCE(score,0) FROM fragmentation_history
				WHERE company_id=$1 AND filial=$2
				ORDER BY recorded_at DESC LIMIT 1
			`, companyID, fs.Filial).Scan(&fs.FragScore)

			// Last wave
			var lastWave sql.NullTime
			db.QueryRow(`
				SELECT MAX(generated_at) FROM replenishment_waves WHERE company_id=$1 AND filial=$2
			`, companyID, fs.Filial).Scan(&lastWave)
			if lastWave.Valid {
				s := lastWave.Time.Format(time.RFC3339)
				fs.LastWaveAt = &s
			}

			filiais = append(filiais, fs)
		}

		// Recent waves (last 10)
		waveRows, _ := db.Query(`
			SELECT id, filial, wave_number, status, total_tasks, generated_at
			FROM replenishment_waves WHERE company_id=$1
			ORDER BY generated_at DESC LIMIT 10
		`, companyID)
		defer waveRows.Close()

		var waves []WaveSummary
		for waveRows.Next() {
			var ws WaveSummary
			var generatedAt time.Time
			waveRows.Scan(&ws.ID, &ws.Filial, &ws.WaveNumber, &ws.Status, &ws.TotalTasks, &generatedAt)
			ws.GeneratedAt = generatedAt.Format(time.RFC3339)
			waves = append(waves, ws)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(PickingDashboard{
			Filiais:        filiais,
			RecentWaves:    waves,
			LastSyncAt:     lastSyncStr,
			NextSyncIn:     nextSyncIn,
			PickingEnabled: pickingEnabled,
			UseMock:        useMock,
		})
	}
}

// --- Fragmentation ---

type FragmentationPoint struct {
	RecordedAt  string  `json:"recorded_at"`
	Score       float64 `json:"score"`
	BelowMin    int     `json:"below_min"`
	Total       int     `json:"total"`
}

type FragmentationResponse struct {
	Filial       string               `json:"filial"`
	CurrentScore float64              `json:"current_score"`
	Trend        float64              `json:"trend_per_day"`
	DaysToAlert  int                  `json:"days_to_alert"`
	History      []FragmentationPoint `json:"history"`
}

func GetFragmentationHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		filial := r.URL.Query().Get("filial")
		days := 30
		if d, err := strconv.Atoi(r.URL.Query().Get("days")); err == nil && d > 0 {
			days = d
		}

		query := `
			SELECT filial, score, locations_below_min, total_active_locations, recorded_at
			FROM fragmentation_history
			WHERE company_id=$1 AND recorded_at > NOW() - ($2 || ' days')::interval
		`
		args := []interface{}{companyID, days}
		if filial != "" {
			query += " AND filial=$3"
			args = append(args, filial)
		}
		query += " ORDER BY filial, recorded_at ASC"

		rows, err := db.Query(query, args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		byFilial := map[string][]FragmentationPoint{}
		for rows.Next() {
			var f, filialCode string
			var score float64
			var belowMin, total int
			var recordedAt time.Time
			rows.Scan(&filialCode, &score, &belowMin, &total, &recordedAt)
			byFilial[filialCode] = append(byFilial[filialCode], FragmentationPoint{
				RecordedAt: recordedAt.Format(time.RFC3339),
				Score:      score,
				BelowMin:   belowMin,
				Total:      total,
			})
			_ = f
		}

		var results []FragmentationResponse
		for fil, points := range byFilial {
			var current float64
			if len(points) > 0 {
				current = points[len(points)-1].Score
			}

			// Simple linear trend (last 7 points)
			trend := 0.0
			if len(points) >= 2 {
				n := len(points)
				start := 0
				if n > 7 {
					start = n - 7
				}
				pts := points[start:]
				if len(pts) >= 2 {
					first := pts[0].Score
					last := pts[len(pts)-1].Score
					trend = (last - first) / float64(len(pts))
				}
			}

			// Days until alert (score >= 60)
			daysToAlert := 0
			if trend > 0 && current < 60 {
				daysToAlert = int(math.Ceil((60 - current) / trend))
			}

			results = append(results, FragmentationResponse{
				Filial:       fil,
				CurrentScore: current,
				Trend:        trend,
				DaysToAlert:  daysToAlert,
				History:      points,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}
}

// --- Picking Locations List ---

type PickingStockItem struct {
	ID          int     `json:"id"`
	LocationID  int     `json:"location_id"`
	Filial      string  `json:"filial"`
	LocationCode string `json:"location_code"`
	ProductCode string  `json:"product_code"`
	ProductDesc string  `json:"product_description"`
	CurrentQty  float64 `json:"current_qty"`
	MinQty      float64 `json:"min_qty"`
	MaxQty      float64 `json:"max_qty"`
	ABCClass    string  `json:"abc_class"`
	OccupancyPct float64 `json:"occupancy_pct"`
	LastSyncAt  *string `json:"last_sync_at"`
}

func ListPickingLocationsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		filial := r.URL.Query().Get("filial")

		query := `
			SELECT ps.id, ps.location_id, ps.filial, pl.location_code,
			       ps.product_code, ps.product_description,
			       ps.current_qty, ps.min_qty, ps.max_qty, ps.abc_class,
			       ps.last_sync_at
			FROM picking_stock ps
			JOIN picking_locations pl ON pl.id = ps.location_id
			WHERE ps.company_id=$1
		`
		args := []interface{}{companyID}
		if filial != "" {
			query += " AND ps.filial=$2"
			args = append(args, filial)
		}
		query += " ORDER BY CASE ps.abc_class WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END, pl.location_code"

		rows, err := db.Query(query, args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var items []PickingStockItem
		for rows.Next() {
			var item PickingStockItem
			var lastSync sql.NullTime
			rows.Scan(&item.ID, &item.LocationID, &item.Filial, &item.LocationCode,
				&item.ProductCode, &item.ProductDesc,
				&item.CurrentQty, &item.MinQty, &item.MaxQty, &item.ABCClass,
				&lastSync)
			if item.MaxQty > 0 {
				item.OccupancyPct = item.CurrentQty / item.MaxQty * 100
			}
			if lastSync.Valid {
				s := lastSync.Time.Format(time.RFC3339)
				item.LastSyncAt = &s
			}
			items = append(items, item)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"items": items, "total": len(items)})
	}
}

// --- Import Picking CSV ---

func ImportPickingCSVHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)

		if err := r.ParseMultipartForm(10 << 20); err != nil {
			http.Error(w, "File too large", http.StatusBadRequest)
			return
		}

		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "No file provided", http.StatusBadRequest)
			return
		}
		defer file.Close()

		reader := csv.NewReader(file)
		reader.Comma = ';'
		reader.TrimLeadingSpace = true

		imported, skipped, errs := 0, 0, []string{}

		// Skip header
		if _, err := reader.Read(); err != nil {
			http.Error(w, "Empty file", http.StatusBadRequest)
			return
		}

		for lineNum := 2; ; lineNum++ {
			record, err := reader.Read()
			if err == io.EOF {
				break
			}
			if err != nil || len(record) < 7 {
				skipped++
				continue
			}

			filial := strings.TrimSpace(record[0])
			locationCode := strings.TrimSpace(record[1])
			productCode := strings.TrimSpace(record[2])
			productDesc := strings.TrimSpace(record[3])
			minQty, _ := strconv.ParseFloat(strings.TrimSpace(record[4]), 64)
			maxQty, _ := strconv.ParseFloat(strings.TrimSpace(record[5]), 64)
			abcClass := strings.ToUpper(strings.TrimSpace(record[6]))

			if filial == "" || locationCode == "" || productCode == "" {
				skipped++
				continue
			}
			if abcClass != "A" && abcClass != "B" && abcClass != "C" {
				abcClass = "C"
			}

			// Parse location code into components (e.g., A-01-02-1)
			parts := strings.Split(locationCode, "-")
			aisle := ""
			bay, level, position := 0, 1, 1
			if len(parts) >= 1 {
				aisle = parts[0]
			}
			if len(parts) >= 2 {
				bay, _ = strconv.Atoi(parts[1])
			}
			if len(parts) >= 3 {
				level, _ = strconv.Atoi(parts[2])
			}
			if len(parts) >= 4 {
				position, _ = strconv.Atoi(parts[3])
			}

			// Upsert picking_location
			var locationID int
			err = db.QueryRow(`
				INSERT INTO picking_locations (company_id, filial, location_code, aisle, bay, level, position)
				VALUES ($1,$2,$3,$4,$5,$6,$7)
				ON CONFLICT (company_id, filial, location_code) DO UPDATE
				  SET aisle=EXCLUDED.aisle, bay=EXCLUDED.bay, level=EXCLUDED.level, position=EXCLUDED.position
				RETURNING id
			`, companyID, filial, locationCode, aisle, bay, level, position).Scan(&locationID)
			if err != nil {
				errs = append(errs, "Linha "+strconv.Itoa(lineNum)+": "+err.Error())
				skipped++
				continue
			}

			// Upsert picking_stock
			_, err = db.Exec(`
				INSERT INTO picking_stock
				  (company_id, filial, location_id, product_code, product_description, current_qty, min_qty, max_qty, abc_class, last_sync_at)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
				ON CONFLICT (company_id, filial, location_id, product_code) DO UPDATE
				  SET min_qty=EXCLUDED.min_qty, max_qty=EXCLUDED.max_qty, abc_class=EXCLUDED.abc_class,
				      product_description=EXCLUDED.product_description
			`, companyID, filial, locationID, productCode, productDesc, maxQty, minQty, maxQty, abcClass)
			if err != nil {
				errs = append(errs, "Linha "+strconv.Itoa(lineNum)+": "+err.Error())
				skipped++
				continue
			}
			imported++
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"imported": imported,
			"skipped":  skipped,
			"errors":   errs,
			"message":  strconv.Itoa(imported) + " enderecos importados com sucesso.",
		})
	}
}

// --- Delete Location ---

func DeletePickingLocationHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		idStr := strings.TrimPrefix(r.URL.Path, "/api/picking/locations/")
		locationID, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid location ID", http.StatusBadRequest)
			return
		}

		res, err := db.Exec(`
			DELETE FROM picking_locations WHERE id=$1 AND company_id=$2
		`, locationID, companyID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		deleted, _ := res.RowsAffected()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"deleted": deleted})
	}
}

// --- Sync Now ---

func SyncNowHandler(db *sql.DB, runNow func(companyID string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		go runNow(companyID)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Sincronizacao iniciada em segundo plano."})
	}
}

// --- Sync Log ---

type SyncLogEntry struct {
	ID               int    `json:"id"`
	Filial           string `json:"filial"`
	SyncType         string `json:"sync_type"`
	Status           string `json:"status"`
	RecordsProcessed int    `json:"records_processed"`
	ErrorMessage     string `json:"error_message"`
	DurationMs       int    `json:"duration_ms"`
	SyncedAt         string `json:"synced_at"`
}

func GetSyncLogHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)

		rows, err := db.Query(`
			SELECT id, COALESCE(filial,''), sync_type, status, records_processed,
			       COALESCE(error_message,''), duration_ms, synced_at
			FROM winthor_sync_log WHERE company_id=$1
			ORDER BY synced_at DESC LIMIT 50
		`, companyID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var entries []SyncLogEntry
		for rows.Next() {
			var e SyncLogEntry
			var syncedAt time.Time
			rows.Scan(&e.ID, &e.Filial, &e.SyncType, &e.Status, &e.RecordsProcessed,
				&e.ErrorMessage, &e.DurationMs, &syncedAt)
			e.SyncedAt = syncedAt.Format(time.RFC3339)
			entries = append(entries, e)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"entries": entries})
	}
}
