package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// --- Types ---

type Wave struct {
	ID              int     `json:"id"`
	Filial          string  `json:"filial"`
	WaveNumber      string  `json:"wave_number"`
	Status          string  `json:"status"`
	TotalTasks      int     `json:"total_tasks"`
	CompletedTasks  int     `json:"completed_tasks"`
	TriggeredBy     string  `json:"triggered_by"`
	GeneratedAt     string  `json:"generated_at"`
	SentAt          *string `json:"sent_to_winthor_at"`
	WinthorResponse string  `json:"winthor_response"`
	ErrorMessage    string  `json:"error_message"`
}

type ReplenishmentTask struct {
	ID             int     `json:"id"`
	ProductCode    string  `json:"product_code"`
	ProductDesc    string  `json:"product_desc"`
	LocationCode   string  `json:"location_code"`
	CurrentQty     float64 `json:"current_qty"`
	MinQty         float64 `json:"min_qty"`
	QtyToReplenish float64 `json:"qty_to_replenish"`
	ABCClass       string  `json:"abc_class"`
	Priority       int     `json:"priority"`
	Status         string  `json:"status"`
	WinthorTaskID  string  `json:"winthor_task_id"`
}

type WaveStats struct {
	Filial         string `json:"filial"`
	TotalWaves     int    `json:"total_waves"`
	WavesToday     int    `json:"waves_today"`
	PendingTasks   int    `json:"pending_tasks"`
	CompletedTasks int    `json:"completed_tasks"`
}

// --- List Waves ---

func ListWavesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		filial := r.URL.Query().Get("filial")
		status := r.URL.Query().Get("status")

		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		limit := 20
		offset := (page - 1) * limit

		query := `SELECT id, filial, wave_number, status, total_tasks, completed_tasks,
		                 triggered_by, generated_at, sent_to_winthor_at,
		                 COALESCE(winthor_response,''), COALESCE(error_message,'')
		          FROM replenishment_waves WHERE company_id=$1`
		args := []interface{}{companyID}
		argIdx := 2

		if filial != "" {
			query += " AND filial=$" + strconv.Itoa(argIdx)
			args = append(args, filial)
			argIdx++
		}
		if status != "" {
			query += " AND status=$" + strconv.Itoa(argIdx)
			args = append(args, status)
			argIdx++
		}

		var total int
		countQuery := strings.Replace(query, "SELECT id, filial, wave_number, status, total_tasks, completed_tasks, triggered_by, generated_at, sent_to_winthor_at, COALESCE(winthor_response,''), COALESCE(error_message,'')", "SELECT COUNT(*)", 1)
		db.QueryRow(countQuery, args...).Scan(&total)

		query += " ORDER BY generated_at DESC LIMIT $" + strconv.Itoa(argIdx) + " OFFSET $" + strconv.Itoa(argIdx+1)
		args = append(args, limit, offset)

		rows, err := db.Query(query, args...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var waves []Wave
		for rows.Next() {
			var wave Wave
			var generatedAt time.Time
			var sentAt sql.NullTime
			rows.Scan(&wave.ID, &wave.Filial, &wave.WaveNumber, &wave.Status,
				&wave.TotalTasks, &wave.CompletedTasks, &wave.TriggeredBy,
				&generatedAt, &sentAt, &wave.WinthorResponse, &wave.ErrorMessage)
			wave.GeneratedAt = generatedAt.Format(time.RFC3339)
			if sentAt.Valid {
				s := sentAt.Time.Format(time.RFC3339)
				wave.SentAt = &s
			}
			waves = append(waves, wave)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"waves": waves, "total": total, "page": page, "limit": limit,
		})
	}
}

// --- Wave Detail ---

func GetWaveDetailHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		idStr := strings.TrimPrefix(r.URL.Path, "/api/waves/")
		waveID, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, "Invalid wave ID", http.StatusBadRequest)
			return
		}

		var wave Wave
		var generatedAt time.Time
		var sentAt sql.NullTime
		err = db.QueryRow(`
			SELECT id, filial, wave_number, status, total_tasks, completed_tasks,
			       triggered_by, generated_at, sent_to_winthor_at,
			       COALESCE(winthor_response,''), COALESCE(error_message,'')
			FROM replenishment_waves WHERE id=$1 AND company_id=$2
		`, waveID, companyID).Scan(
			&wave.ID, &wave.Filial, &wave.WaveNumber, &wave.Status,
			&wave.TotalTasks, &wave.CompletedTasks, &wave.TriggeredBy,
			&generatedAt, &sentAt, &wave.WinthorResponse, &wave.ErrorMessage)
		if err == sql.ErrNoRows {
			http.Error(w, "Wave not found", http.StatusNotFound)
			return
		}
		wave.GeneratedAt = generatedAt.Format(time.RFC3339)
		if sentAt.Valid {
			s := sentAt.Time.Format(time.RFC3339)
			wave.SentAt = &s
		}

		// Tasks
		taskRows, _ := db.Query(`
			SELECT id, product_code, COALESCE(product_description,''), location_code,
			       current_qty, min_qty, qty_to_replenish, abc_class, priority, status,
			       COALESCE(winthor_task_id,'')
			FROM replenishment_tasks WHERE wave_id=$1 ORDER BY priority ASC, abc_class ASC
		`, waveID)
		defer taskRows.Close()

		var tasks []ReplenishmentTask
		for taskRows.Next() {
			var t ReplenishmentTask
			taskRows.Scan(&t.ID, &t.ProductCode, &t.ProductDesc, &t.LocationCode,
				&t.CurrentQty, &t.MinQty, &t.QtyToReplenish, &t.ABCClass, &t.Priority,
				&t.Status, &t.WinthorTaskID)
			tasks = append(tasks, t)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"wave": wave, "tasks": tasks})
	}
}

// --- Generate Wave Manually ---

func GenerateWaveHandler(db *sql.DB, generateFn func(companyID, filial string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		var req struct {
			Filial string `json:"filial"`
		}
		json.NewDecoder(r.Body).Decode(&req)
		if req.Filial == "" {
			http.Error(w, "filial is required", http.StatusBadRequest)
			return
		}

		go func() {
			if err := generateFn(companyID, req.Filial); err != nil {
				// Log error but don't block response
				_ = err
			}
		}()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "Geracao de onda iniciada para filial " + req.Filial + ".",
		})
	}
}

// --- Wave Stats ---

func GetWaveStatsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)

		rows, err := db.Query(`
			SELECT filial,
			       COUNT(*) as total_waves,
			       SUM(CASE WHEN generated_at::date = CURRENT_DATE THEN 1 ELSE 0 END) as waves_today
			FROM replenishment_waves WHERE company_id=$1
			GROUP BY filial ORDER BY filial
		`, companyID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var stats []WaveStats
		for rows.Next() {
			var s WaveStats
			rows.Scan(&s.Filial, &s.TotalWaves, &s.WavesToday)

			db.QueryRow(`
				SELECT COALESCE(SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END),0),
				       COALESCE(SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END),0)
				FROM replenishment_tasks
				WHERE company_id=$1 AND filial=$2
			`, companyID, s.Filial).Scan(&s.PendingTasks, &s.CompletedTasks)

			stats = append(stats, s)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"stats": stats})
	}
}
