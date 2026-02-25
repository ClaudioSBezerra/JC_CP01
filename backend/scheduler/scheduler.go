package scheduler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"

	"aprovapedido/handlers"
)

type PickingScheduler struct {
	db     *sql.DB
	stopCh chan struct{}
	mu     sync.Mutex
	ticker *time.Ticker
}

func New(db *sql.DB) *PickingScheduler {
	return &PickingScheduler{
		db:     db,
		stopCh: make(chan struct{}),
	}
}

func (s *PickingScheduler) Start(ctx context.Context) {
	log.Println("[Scheduler] PickingScheduler started")

	// Check every minute to see if any company needs a sync cycle
	s.ticker = time.NewTicker(1 * time.Minute)
	defer s.ticker.Stop()

	// Run immediately on start (after a short delay for DB to be ready)
	time.Sleep(5 * time.Second)
	s.completeOldWaves()
	s.runAllCompanies()

	for {
		select {
		case <-s.ticker.C:
			s.completeOldWaves()
			s.runAllCompanies()
		case <-s.stopCh:
			log.Println("[Scheduler] PickingScheduler stopped")
			return
		case <-ctx.Done():
			log.Println("[Scheduler] PickingScheduler context cancelled")
			return
		}
	}
}

func (s *PickingScheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	close(s.stopCh)
}

// RunNow triggers an immediate sync for a specific company (called from API)
func (s *PickingScheduler) RunNow(companyID string) {
	go s.runCompany(companyID)
}

func (s *PickingScheduler) runAllCompanies() {
	rows, err := s.db.Query(`
		SELECT c.id::text FROM companies c
		INNER JOIN settings st ON st.company_id = c.id
		WHERE st.picking_enabled = TRUE
	`)
	if err != nil {
		log.Printf("[Scheduler] Error fetching companies: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var companyID string
		if err := rows.Scan(&companyID); err != nil {
			continue
		}
		s.runCompany(companyID)
	}
}

func (s *PickingScheduler) runCompany(companyID string) {
	// Load settings
	var intervalMinutes int
	var activeFiliaisJSON string
	var useMock bool
	var apiURL, apiKey string

	err := s.db.QueryRow(`
		SELECT COALESCE(sync_interval_minutes, 30),
		       COALESCE(active_filiais, '["01","02","03"]'),
		       COALESCE(use_mock_winthor, TRUE),
		       COALESCE(winthor_api_url, ''),
		       COALESCE(winthor_api_key, '')
		FROM settings WHERE company_id = $1
	`, companyID).Scan(&intervalMinutes, &activeFiliaisJSON, &useMock, &apiURL, &apiKey)
	if err != nil {
		log.Printf("[Scheduler] Company %s: cannot load settings: %v", companyID, err)
		return
	}

	// Check if enough time has passed since last sync
	var lastSyncAt sql.NullTime
	s.db.QueryRow(`
		SELECT MAX(synced_at) FROM winthor_sync_log
		WHERE company_id = $1 AND sync_type = 'stock_fetch' AND status = 'success'
	`, companyID).Scan(&lastSyncAt)

	if lastSyncAt.Valid {
		elapsed := time.Since(lastSyncAt.Time)
		if elapsed < time.Duration(intervalMinutes)*time.Minute {
			return // Not time yet
		}
	}

	var filiais []string
	if err := json.Unmarshal([]byte(activeFiliaisJSON), &filiais); err != nil {
		filiais = []string{"01", "02", "03"}
	}

	winthorSettings := handlers.PickingSettings{
		UseMock: useMock,
		APIURL:  apiURL,
		APIKey:  apiKey,
	}
	client := handlers.NewWinthorClient(s.db, winthorSettings)

	for _, filial := range filiais {
		s.syncFilial(companyID, filial, client)
	}
}

func (s *PickingScheduler) syncFilial(companyID, filial string, client handlers.WinthorClient) {
	start := time.Now()
	log.Printf("[Scheduler] Syncing company=%s filial=%s", companyID, filial)

	// 1. Fetch stock from Winthor (or mock)
	items, err := client.GetPickingStock(companyID, filial)
	durMs := int(time.Since(start).Milliseconds())

	if err != nil {
		log.Printf("[Scheduler] GetPickingStock error: %v", err)
		s.logSync(companyID, filial, "stock_fetch", "error", 0, err.Error(), durMs)
		return
	}

	// 2. Upsert picking_stock records
	for _, item := range items {
		s.db.Exec(`
			UPDATE picking_stock
			SET current_qty = $1, last_sync_at = NOW(), updated_at = NOW()
			WHERE company_id = $2 AND filial = $3 AND product_code = $4
		`, item.CurrentQty, companyID, filial, item.ProductCode)
	}

	s.logSync(companyID, filial, "stock_fetch", "success", len(items), "", durMs)

	// 3. Count locations below minimum
	var belowMin int
	s.db.QueryRow(`
		SELECT COUNT(*) FROM picking_stock
		WHERE company_id = $1 AND filial = $2 AND current_qty <= min_qty AND min_qty > 0
	`, companyID, filial).Scan(&belowMin)

	// 4. Calculate and record fragmentation score
	s.recordFragmentationScore(companyID, filial)

	// 5. Generate wave if there are locations below minimum
	if belowMin > 0 {
		log.Printf("[Scheduler] company=%s filial=%s: %d locations below min, generating wave", companyID, filial, belowMin)
		if err := s.generateWave(companyID, filial, client, "scheduler"); err != nil {
			log.Printf("[Scheduler] generateWave error: %v", err)
		}
	} else {
		log.Printf("[Scheduler] company=%s filial=%s: all locations OK", companyID, filial)
	}
}

func (s *PickingScheduler) generateWave(companyID, filial string, client handlers.WinthorClient, triggeredBy string) error {
	// Fetch locations below minimum, ordered by ABC priority
	rows, err := s.db.Query(`
		SELECT ps.product_code, ps.product_description, pl.location_code,
		       ps.current_qty, ps.min_qty, ps.max_qty, ps.abc_class,
		       CASE ps.abc_class WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END as priority
		FROM picking_stock ps
		JOIN picking_locations pl ON pl.id = ps.location_id
		WHERE ps.company_id = $1 AND ps.filial = $2
		  AND ps.current_qty <= ps.min_qty AND ps.min_qty > 0
		ORDER BY priority ASC, (ps.min_qty - ps.current_qty) DESC
	`, companyID, filial)
	if err != nil {
		return err
	}
	defer rows.Close()

	type taskRow struct {
		ProductCode  string
		ProductDesc  string
		LocationCode string
		CurrentQty   float64
		MinQty       float64
		MaxQty       float64
		ABCClass     string
		Priority     int
	}

	var tasks []taskRow
	for rows.Next() {
		var t taskRow
		rows.Scan(&t.ProductCode, &t.ProductDesc, &t.LocationCode,
			&t.CurrentQty, &t.MinQty, &t.MaxQty, &t.ABCClass, &t.Priority)
		tasks = append(tasks, t)
	}

	if len(tasks) == 0 {
		return nil
	}

	// Generate wave number: YYYYMMDD-FILIAL-SEQ
	var seqCount int
	s.db.QueryRow(`
		SELECT COUNT(*) FROM replenishment_waves
		WHERE company_id = $1 AND filial = $2
		  AND generated_at::date = CURRENT_DATE
	`, companyID, filial).Scan(&seqCount)

	waveNumber := fmt.Sprintf("%s-%s-%03d",
		time.Now().Format("20060102"), filial, seqCount+1)

	// Create wave record
	var waveID int
	err = s.db.QueryRow(`
		INSERT INTO replenishment_waves (company_id, filial, wave_number, total_tasks, triggered_by)
		VALUES ($1, $2, $3, $4, $5) RETURNING id
	`, companyID, filial, waveNumber, len(tasks), triggeredBy).Scan(&waveID)
	if err != nil {
		return fmt.Errorf("insert wave: %w", err)
	}

	// Build Winthor payload
	var winthorTasks []handlers.WinthorTaskItem
	for _, t := range tasks {
		qtyToReplenish := t.MaxQty - t.CurrentQty
		if qtyToReplenish <= 0 {
			qtyToReplenish = t.MinQty
		}

		// Insert task record
		s.db.Exec(`
			INSERT INTO replenishment_tasks
			  (wave_id, company_id, filial, product_code, product_description,
			   location_code, current_qty, min_qty, qty_to_replenish, abc_class, priority)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		`, waveID, companyID, filial, t.ProductCode, t.ProductDesc,
			t.LocationCode, t.CurrentQty, t.MinQty, qtyToReplenish, t.ABCClass, t.Priority)

		winthorTasks = append(winthorTasks, handlers.WinthorTaskItem{
			LocationCode:   t.LocationCode,
			ProductCode:    t.ProductCode,
			ProductDesc:    t.ProductDesc,
			QtyToReplenish: qtyToReplenish,
			ABCClass:       t.ABCClass,
			Priority:       t.Priority,
		})
	}

	// Send to Winthor
	payload := handlers.WinthorWavePayload{
		WaveNumber:  waveNumber,
		Filial:      filial,
		Tasks:       winthorTasks,
		GeneratedAt: time.Now().Format(time.RFC3339),
	}

	start := time.Now()
	resp, err := client.SendReplenishmentWave(companyID, payload)
	durMs := int(time.Since(start).Milliseconds())

	if err != nil {
		s.db.Exec(`UPDATE replenishment_waves SET status='erro', error_message=$1 WHERE id=$2`,
			err.Error(), waveID)
		s.logSync(companyID, filial, "wave_send", "error", len(tasks), err.Error(), durMs)
		return fmt.Errorf("send wave: %w", err)
	}

	// Update wave as sent
	s.db.Exec(`
		UPDATE replenishment_waves
		SET status='enviada', sent_to_winthor_at=NOW(), winthor_response=$1
		WHERE id=$2
	`, resp.WinthorRef, waveID)

	s.logSync(companyID, filial, "wave_send", "success", len(tasks), "", durMs)
	log.Printf("[Scheduler] Wave %s sent: %s", waveNumber, resp.WinthorRef)
	return nil
}

// completeOldWaves marks waves sent more than 5 minutes ago as "concluida",
// updates their tasks, and refills the picking stock to simulate replenishment.
func (s *PickingScheduler) completeOldWaves() {
	rows, err := s.db.Query(`
		SELECT id, company_id::text, filial
		FROM replenishment_waves
		WHERE status = 'enviada'
		  AND sent_to_winthor_at < NOW() - INTERVAL '5 minutes'
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	type pendingWave struct {
		ID        int
		CompanyID string
		Filial    string
	}
	var pending []pendingWave
	for rows.Next() {
		var w pendingWave
		rows.Scan(&w.ID, &w.CompanyID, &w.Filial)
		pending = append(pending, w)
	}

	for _, w := range pending {
		// 1. Mark wave as concluida
		_, err := s.db.Exec(`
			UPDATE replenishment_waves
			SET status = 'concluida',
			    completed_at = NOW(),
			    completed_tasks = total_tasks
			WHERE id = $1
		`, w.ID)
		if err != nil {
			log.Printf("[Scheduler] completeOldWaves: update wave %d: %v", w.ID, err)
			continue
		}

		// 2. Mark all tasks as concluido
		s.db.Exec(`
			UPDATE replenishment_tasks
			SET status = 'concluido', completed_at = NOW()
			WHERE wave_id = $1
		`, w.ID)

		// 3. Refill picking_stock for replenished locations (current_qty → max_qty)
		// This simulates the warehouse operator completing the physical replenishment.
		s.db.Exec(`
			UPDATE picking_stock ps
			SET current_qty = ps.max_qty,
			    last_sync_at = NOW(),
			    updated_at   = NOW()
			WHERE ps.company_id = $1
			  AND ps.filial     = $2
			  AND ps.location_id IN (
			      SELECT pl.id
			      FROM picking_locations pl
			      INNER JOIN replenishment_tasks rt
			          ON  rt.location_code = pl.location_code
			          AND rt.company_id    = pl.company_id
			          AND rt.filial        = pl.filial
			      WHERE rt.wave_id = $3
			  )
		`, w.CompanyID, w.Filial, w.ID)

		log.Printf("[Scheduler] Wave %d (filial %s) concluida — stock refilled", w.ID, w.Filial)
		s.logSync(w.CompanyID, w.Filial, "wave_complete", "success", 0, "", 0)
	}
}

func (s *PickingScheduler) recordFragmentationScore(companyID, filial string) {
	// Calculate weighted fragmentation score per filial
	// Score: weighted shortage percentage (A=3x, B=2x, C=1x weight)
	rows, err := s.db.Query(`
		SELECT current_qty, min_qty, abc_class
		FROM picking_stock
		WHERE company_id = $1 AND filial = $2 AND min_qty > 0
	`, companyID, filial)
	if err != nil {
		return
	}
	defer rows.Close()

	var totalWeight, weightedScore float64
	var belowMin, total int
	for rows.Next() {
		var currentQty, minQty float64
		var abcClass string
		rows.Scan(&currentQty, &minQty, &abcClass)

		var weight float64
		switch abcClass {
		case "A":
			weight = 3.0
		case "B":
			weight = 2.0
		default:
			weight = 1.0
		}

		shortage := math.Max(0, (minQty-currentQty)/minQty) * 100
		weightedScore += shortage * weight
		totalWeight += weight
		total++
		if currentQty <= minQty {
			belowMin++
		}
	}

	score := 0.0
	if totalWeight > 0 {
		score = weightedScore / totalWeight
		if score > 100 {
			score = 100
		}
	}

	s.db.Exec(`
		INSERT INTO fragmentation_history (company_id, filial, score, locations_below_min, total_active_locations)
		VALUES ($1, $2, $3, $4, $5)
	`, companyID, filial, score, belowMin, total)
}

func (s *PickingScheduler) logSync(companyID, filial, syncType, status string, records int, errMsg string, durMs int) {
	s.db.Exec(`
		INSERT INTO winthor_sync_log (company_id, filial, sync_type, status, records_processed, error_message, duration_ms)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`, companyID, filial, syncType, status, records, errMsg, durMs)
}

// GenerateWaveManual is called from the API handler
func GenerateWaveManual(db *sql.DB, companyID, filial string) error {
	winthorSettings := loadPickingSettings(db, companyID)
	client := handlers.NewWinthorClient(db, winthorSettings)

	sched := &PickingScheduler{db: db}
	// First do a sync to get fresh data
	sched.syncFilial(companyID, filial, client)
	return nil
}

func loadPickingSettings(db *sql.DB, companyID string) handlers.PickingSettings {
	var useMock bool
	var apiURL, apiKey string
	db.QueryRow(`
		SELECT COALESCE(use_mock_winthor,TRUE), COALESCE(winthor_api_url,''), COALESCE(winthor_api_key,'')
		FROM settings WHERE company_id=$1
	`, companyID).Scan(&useMock, &apiURL, &apiKey)
	return handlers.PickingSettings{UseMock: useMock, APIURL: apiURL, APIKey: apiKey}
}

// Suppress unused import warning for rand
var _ = rand.Float64
