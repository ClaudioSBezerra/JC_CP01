package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

type Settings struct {
	LowTurnoverDays     int    `json:"low_turnover_days"`
	WarningTurnoverDays int    `json:"warning_turnover_days"`
	PickingEnabled      bool   `json:"picking_enabled"`
	WinthorAPIURL       string `json:"winthor_api_url"`
	WinthorAPIKey       string `json:"winthor_api_key"`
	SyncIntervalMinutes int    `json:"sync_interval_minutes"`
	SyncSchedule        string `json:"sync_schedule"`
	ActiveFiliais       string `json:"active_filiais"`
	UseMockWinthor      bool   `json:"use_mock_winthor"`
}

func GetSettingsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		var s Settings
		err := db.QueryRow(`
			SELECT COALESCE(low_turnover_days,90), COALESCE(warning_turnover_days,60),
			       COALESCE(picking_enabled,false), COALESCE(winthor_api_url,''),
			       COALESCE(winthor_api_key,''), COALESCE(sync_interval_minutes,30),
			       COALESCE(sync_schedule,'["06:00","12:00","18:00"]'),
			       COALESCE(active_filiais,'["01","02","03"]'),
			       COALESCE(use_mock_winthor,true)
			FROM settings WHERE company_id = $1
		`, companyID).Scan(
			&s.LowTurnoverDays, &s.WarningTurnoverDays,
			&s.PickingEnabled, &s.WinthorAPIURL, &s.WinthorAPIKey,
			&s.SyncIntervalMinutes, &s.SyncSchedule, &s.ActiveFiliais, &s.UseMockWinthor,
		)
		if err != nil {
			s.LowTurnoverDays = 90
			s.WarningTurnoverDays = 60
			s.SyncIntervalMinutes = 30
			s.SyncSchedule = `["06:00","12:00","18:00"]`
			s.ActiveFiliais = `["01","02","03"]`
			s.UseMockWinthor = true
		}

		// Mask API key for security
		if len(s.WinthorAPIKey) > 4 {
			s.WinthorAPIKey = "****" + s.WinthorAPIKey[len(s.WinthorAPIKey)-4:]
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(s)
	}
}

func UpdateSettingsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		var s Settings
		if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if s.LowTurnoverDays < 1 {
			s.LowTurnoverDays = 90
		}
		if s.WarningTurnoverDays < 1 {
			s.WarningTurnoverDays = 60
		}
		if s.WarningTurnoverDays >= s.LowTurnoverDays {
			s.WarningTurnoverDays = s.LowTurnoverDays - 10
		}
		if s.SyncIntervalMinutes < 5 {
			s.SyncIntervalMinutes = 30
		}
		if s.SyncSchedule == "" {
			s.SyncSchedule = `["06:00","12:00","18:00"]`
		}
		if s.ActiveFiliais == "" {
			s.ActiveFiliais = `["01","02","03"]`
		}

		// Don't overwrite API key if it's masked
		var existingKey string
		db.QueryRow(`SELECT COALESCE(winthor_api_key,'') FROM settings WHERE company_id=$1`, companyID).Scan(&existingKey)
		if s.WinthorAPIKey == "" || (len(s.WinthorAPIKey) > 0 && s.WinthorAPIKey[:4] == "****") {
			s.WinthorAPIKey = existingKey
		}

		_, err := db.Exec(`
			INSERT INTO settings (company_id, low_turnover_days, warning_turnover_days,
			  picking_enabled, winthor_api_url, winthor_api_key, sync_interval_minutes,
			  sync_schedule, active_filiais, use_mock_winthor, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
			ON CONFLICT (company_id) DO UPDATE SET
				low_turnover_days=EXCLUDED.low_turnover_days,
				warning_turnover_days=EXCLUDED.warning_turnover_days,
				picking_enabled=EXCLUDED.picking_enabled,
				winthor_api_url=EXCLUDED.winthor_api_url,
				winthor_api_key=EXCLUDED.winthor_api_key,
				sync_interval_minutes=EXCLUDED.sync_interval_minutes,
				sync_schedule=EXCLUDED.sync_schedule,
				active_filiais=EXCLUDED.active_filiais,
				use_mock_winthor=EXCLUDED.use_mock_winthor,
				updated_at=NOW()
		`, companyID, s.LowTurnoverDays, s.WarningTurnoverDays,
			s.PickingEnabled, s.WinthorAPIURL, s.WinthorAPIKey, s.SyncIntervalMinutes,
			s.SyncSchedule, s.ActiveFiliais, s.UseMockWinthor)

		if err != nil {
			http.Error(w, "Error saving settings: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Configuracoes salvas com sucesso"})
	}
}
