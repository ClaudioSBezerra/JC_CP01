package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
)

type DashboardSummary struct {
	PendingOrders    int     `json:"pending_orders"`
	ApprovedToday    int     `json:"approved_today"`
	RejectedToday    int     `json:"rejected_today"`
	SavedValue       float64 `json:"saved_value"`
	TotalProducts    int     `json:"total_products"`
	LowTurnoverProducts int  `json:"low_turnover_products"`
}

type TopProduct struct {
	Code        string  `json:"code"`
	Description string  `json:"description"`
	StockDays   float64 `json:"stock_days"`
	StockValue  float64 `json:"stock_value"`
}

type StatusCount struct {
	Status string `json:"status"`
	Count  int    `json:"count"`
}

type SavingsData struct {
	Month string  `json:"month"`
	Value float64 `json:"value"`
}

func DashboardSummaryHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		var summary DashboardSummary

		db.QueryRow("SELECT COUNT(*) FROM purchase_orders WHERE company_id = $1 AND status = 'pendente'", companyID).Scan(&summary.PendingOrders)
		db.QueryRow("SELECT COUNT(*) FROM purchase_orders WHERE company_id = $1 AND status IN ('aprovado','aprovado_parcial') AND approved_at::date = CURRENT_DATE", companyID).Scan(&summary.ApprovedToday)
		db.QueryRow("SELECT COUNT(*) FROM purchase_orders WHERE company_id = $1 AND status = 'reprovado' AND approved_at::date = CURRENT_DATE", companyID).Scan(&summary.RejectedToday)

		// Saved value = sum of total_price of rejected items
		db.QueryRow(`
			SELECT COALESCE(SUM(poi.total_price), 0)
			FROM purchase_order_items poi
			JOIN purchase_orders po ON poi.order_id = po.id
			WHERE po.company_id = $1 AND poi.item_status = 'reprovado'
		`, companyID).Scan(&summary.SavedValue)

		db.QueryRow("SELECT COUNT(*) FROM products WHERE company_id = $1", companyID).Scan(&summary.TotalProducts)

		var lowDays int
		err := db.QueryRow("SELECT COALESCE(low_turnover_days, 90) FROM settings WHERE company_id = $1", companyID).Scan(&lowDays)
		if err != nil {
			lowDays = 90
		}
		db.QueryRow("SELECT COUNT(*) FROM products WHERE company_id = $1 AND stock_days >= $2", companyID, lowDays).Scan(&summary.LowTurnoverProducts)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(summary)
	}
}

func DashboardChartsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		// Top 10 products by stock_days
		topRows, err := db.Query(`
			SELECT code, description, stock_days, current_stock * cost_price as stock_value
			FROM products
			WHERE company_id = $1 AND stock_days > 0
			ORDER BY stock_days DESC
			LIMIT 10
		`, companyID)
		var topProducts []TopProduct
		if err == nil {
			defer topRows.Close()
			for topRows.Next() {
				var p TopProduct
				topRows.Scan(&p.Code, &p.Description, &p.StockDays, &p.StockValue)
				topProducts = append(topProducts, p)
			}
		}
		if topProducts == nil {
			topProducts = []TopProduct{}
		}

		// Orders by status
		statusRows, err := db.Query(`
			SELECT status, COUNT(*) as count
			FROM purchase_orders
			WHERE company_id = $1
			GROUP BY status
		`, companyID)
		var statusCounts []StatusCount
		if err == nil {
			defer statusRows.Close()
			for statusRows.Next() {
				var s StatusCount
				statusRows.Scan(&s.Status, &s.Count)
				statusCounts = append(statusCounts, s)
			}
		}
		if statusCounts == nil {
			statusCounts = []StatusCount{}
		}

		// Monthly savings (rejected items value)
		savingsRows, err := db.Query(`
			SELECT TO_CHAR(po.approved_at, 'YYYY-MM') as month, COALESCE(SUM(poi.total_price), 0) as value
			FROM purchase_order_items poi
			JOIN purchase_orders po ON poi.order_id = po.id
			WHERE po.company_id = $1 AND poi.item_status = 'reprovado' AND po.approved_at IS NOT NULL
			GROUP BY TO_CHAR(po.approved_at, 'YYYY-MM')
			ORDER BY month DESC
			LIMIT 12
		`, companyID)
		var savings []SavingsData
		if err == nil {
			defer savingsRows.Close()
			for savingsRows.Next() {
				var s SavingsData
				savingsRows.Scan(&s.Month, &s.Value)
				savings = append(savings, s)
			}
		}
		if savings == nil {
			savings = []SavingsData{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"top_products":  topProducts,
			"status_counts": statusCounts,
			"savings":       savings,
		})
	}
}
