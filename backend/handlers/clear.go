package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
)

type moduleTable struct {
	name  string
	query string
}

var moduleCompras = []moduleTable{
	{"approval_history", "DELETE FROM approval_history WHERE order_id IN (SELECT id FROM purchase_orders WHERE company_id = $1)"},
	{"purchase_order_items", "DELETE FROM purchase_order_items WHERE order_id IN (SELECT id FROM purchase_orders WHERE company_id = $1)"},
	{"purchase_orders", "DELETE FROM purchase_orders WHERE company_id = $1"},
	{"products", "DELETE FROM products WHERE company_id = $1"},
}

var moduleLogistica = []moduleTable{
	{"replenishment_tasks", "DELETE FROM replenishment_tasks WHERE company_id = $1"},
	{"replenishment_waves", "DELETE FROM replenishment_waves WHERE company_id = $1"},
	{"fragmentation_history", "DELETE FROM fragmentation_history WHERE company_id = $1"},
	{"winthor_sync_log", "DELETE FROM winthor_sync_log WHERE company_id = $1"},
	{"picking_stock", "DELETE FROM picking_stock WHERE company_id = $1"},
	{"picking_locations", "DELETE FROM picking_locations WHERE company_id = $1"},
}

var moduleComercial = []moduleTable{
	{"rca_visits", "DELETE FROM rca_visits WHERE company_id = $1"},
	{"rca_customers", "DELETE FROM rca_customers WHERE company_id = $1"},
	{"rca_routes", "DELETE FROM rca_routes WHERE company_id = $1"},
}

func execClear(tx *sql.Tx, tables []moduleTable, companyID string) (map[string]int64, error) {
	counts := map[string]int64{}
	for _, t := range tables {
		res, err := tx.Exec(t.query, companyID)
		if err != nil {
			log.Printf("[Clear] Error clearing %s: %v", t.name, err)
			return nil, err
		}
		n, _ := res.RowsAffected()
		counts[t.name] = n
	}
	return counts, nil
}

// ClearModuleHandler handles POST /api/clear-module
// Body: {"module": "compras" | "logistica" | "comercial"}
// Clears only the selected module's operational data.
func ClearModuleHandler(db *sql.DB) http.HandlerFunc {
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

		var req struct {
			Module string `json:"module"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		var tables []moduleTable
		switch req.Module {
		case "compras":
			tables = moduleCompras
		case "logistica":
			tables = moduleLogistica
		case "comercial":
			tables = moduleComercial
		default:
			http.Error(w, "Invalid module. Use: compras, logistica or comercial", http.StatusBadRequest)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		counts, err := execClear(tx, tables, companyID)
		if err != nil {
			http.Error(w, "Error clearing data: "+err.Error(), http.StatusInternalServerError)
			return
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "Error committing", http.StatusInternalServerError)
			return
		}

		log.Printf("[ClearModule] Company %s module=%s cleared. counts=%v", companyID, req.Module, counts)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Módulo " + req.Module + " limpo com sucesso.",
			"cleared": counts,
		})
	}
}

// ClearAllHandler removes all transactional data for the company.
// Settings, users, company and rca_representatives are preserved.
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

		allTables := append(append(append([]moduleTable{}, moduleComercial...), moduleLogistica...), moduleCompras...)
		counts, err := execClear(tx, allTables, companyID)
		if err != nil {
			http.Error(w, "Error clearing data: "+err.Error(), http.StatusInternalServerError)
			return
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "Error committing", http.StatusInternalServerError)
			return
		}

		log.Printf("[ClearAll] Company %s: all data cleared. counts=%v", companyID, counts)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Limpeza geral concluída com sucesso. Todos os dados transacionais foram removidos.",
			"cleared": counts,
		})
	}
}
