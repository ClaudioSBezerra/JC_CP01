package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
)

// ClearAllHandler removes all transactional data for the company.
// Settings, users and company record are preserved.
func ClearAllHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		tables := []struct {
			name  string
			query string
		}{
			// Logistics — tasks first (FK to waves)
			{"replenishment_tasks", "DELETE FROM replenishment_tasks WHERE company_id = $1"},
			{"replenishment_waves", "DELETE FROM replenishment_waves WHERE company_id = $1"},
			{"fragmentation_history", "DELETE FROM fragmentation_history WHERE company_id = $1"},
			{"winthor_sync_log", "DELETE FROM winthor_sync_log WHERE company_id = $1"},
			// picking_stock cascades from picking_locations, but delete explicitly for clarity
			{"picking_stock", "DELETE FROM picking_stock WHERE company_id = $1"},
			{"picking_locations", "DELETE FROM picking_locations WHERE company_id = $1"},
			// Compras
			{"approval_history", "DELETE FROM approval_history WHERE order_id IN (SELECT id FROM purchase_orders WHERE company_id = $1)"},
			{"purchase_order_items", "DELETE FROM purchase_order_items WHERE order_id IN (SELECT id FROM purchase_orders WHERE company_id = $1)"},
			{"purchase_orders", "DELETE FROM purchase_orders WHERE company_id = $1"},
			{"products", "DELETE FROM products WHERE company_id = $1"},
		}

		counts := map[string]int64{}
		for _, t := range tables {
			res, err := tx.Exec(t.query, companyID)
			if err != nil {
				log.Printf("[ClearAll] Error clearing %s: %v", t.name, err)
				http.Error(w, "Error clearing "+t.name+": "+err.Error(), http.StatusInternalServerError)
				return
			}
			n, _ := res.RowsAffected()
			counts[t.name] = n
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "Error committing", http.StatusInternalServerError)
			return
		}

		log.Printf("[ClearAll] Company %s: all data cleared. counts=%v", companyID, counts)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Limpeza geral concluida com sucesso. Todos os dados transacionais foram removidos.",
			"cleared": counts,
		})
	}
}
