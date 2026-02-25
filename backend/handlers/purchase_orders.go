package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

type PurchaseOrder struct {
	ID           int     `json:"id"`
	OrderNumber  string  `json:"order_number"`
	SupplierName string  `json:"supplier_name"`
	SupplierCNPJ string  `json:"supplier_cnpj"`
	BuyerName    string  `json:"buyer_name"`
	Status       string  `json:"status"`
	TotalValue   float64 `json:"total_value"`
	TotalItems   int     `json:"total_items"`
	FlaggedItems int     `json:"flagged_items"`
	Notes        *string `json:"notes"`
	ApprovedBy   *int    `json:"approved_by"`
	ApprovedAt   *string `json:"approved_at"`
	CreatedAt    string  `json:"created_at"`
}

type PurchaseOrderItem struct {
	ID                 int     `json:"id"`
	OrderID            int     `json:"order_id"`
	ProductCode        string  `json:"product_code"`
	ProductDescription string  `json:"product_description"`
	Quantity           float64 `json:"quantity"`
	UnitPrice          float64 `json:"unit_price"`
	TotalPrice         float64 `json:"total_price"`
	StockDays          float64 `json:"stock_days"`
	CurrentStock       float64 `json:"current_stock"`
	AvgDailySales      float64 `json:"avg_daily_sales"`
	IsLowTurnover      bool    `json:"is_low_turnover"`
	ItemStatus         string  `json:"item_status"`
	RejectionReason    *string `json:"rejection_reason"`
	// Sprint 2 - branch data from product
	StockFilial01         float64 `json:"stock_filial_01"`
	StockFilial02         float64 `json:"stock_filial_02"`
	StockFilial03         float64 `json:"stock_filial_03"`
	AvgDailySalesFilial01 float64 `json:"avg_daily_sales_filial_01"`
	AvgDailySalesFilial02 float64 `json:"avg_daily_sales_filial_02"`
	AvgDailySalesFilial03 float64 `json:"avg_daily_sales_filial_03"`
	StockDaysFilial01     float64 `json:"stock_days_filial_01"`
	StockDaysFilial02     float64 `json:"stock_days_filial_02"`
	StockDaysFilial03     float64 `json:"stock_days_filial_03"`
	SeasonalityType       string  `json:"seasonality_type"`
	PeakMonths            string  `json:"peak_months"`
	SupplierLeadTimeDays  int     `json:"supplier_lead_time_days"`
	MinStockDays          int     `json:"min_stock_days"`
	MaxStockDays          int     `json:"max_stock_days"`
	CoveragePostPurchase  float64 `json:"coverage_post_purchase"`
	RiskExcess            bool    `json:"risk_excess"`
}

func ListOrdersHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		status := r.URL.Query().Get("status")
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		limit := 20
		offset := (page - 1) * limit

		query := `SELECT id, order_number, supplier_name, COALESCE(supplier_cnpj,''), COALESCE(buyer_name,''), status, total_value, total_items, flagged_items, notes, approved_by, approved_at::text, created_at FROM purchase_orders WHERE company_id = $1`
		countQuery := `SELECT COUNT(*) FROM purchase_orders WHERE company_id = $1`
		args := []interface{}{companyID}
		argIdx := 2

		if status != "" {
			query += ` AND status = $` + strconv.Itoa(argIdx)
			countQuery += ` AND status = $` + strconv.Itoa(argIdx)
			args = append(args, status)
			argIdx++
		}

		var total int
		db.QueryRow(countQuery, args...).Scan(&total)

		query += ` ORDER BY flagged_items DESC, created_at DESC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
		args = append(args, limit, offset)

		rows, err := db.Query(query, args...)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var orders []PurchaseOrder
		for rows.Next() {
			var o PurchaseOrder
			var notes sql.NullString
			var approvedBy sql.NullInt64
			var approvedAt sql.NullString
			if err := rows.Scan(&o.ID, &o.OrderNumber, &o.SupplierName, &o.SupplierCNPJ, &o.BuyerName, &o.Status, &o.TotalValue, &o.TotalItems, &o.FlaggedItems, &notes, &approvedBy, &approvedAt, &o.CreatedAt); err != nil {
				continue
			}
			if notes.Valid {
				o.Notes = &notes.String
			}
			if approvedAt.Valid {
				o.ApprovedAt = &approvedAt.String
			}
			orders = append(orders, o)
		}

		if orders == nil {
			orders = []PurchaseOrder{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"orders": orders,
			"total":  total,
			"page":   page,
			"limit":  limit,
		})
	}
}

func GetOrderDetailHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/api/orders/")
		parts := strings.Split(path, "/")
		orderID := parts[0]

		if orderID == "" {
			http.Error(w, "Order ID required", http.StatusBadRequest)
			return
		}

		var order PurchaseOrder
		var notes sql.NullString
		var approvedBy sql.NullInt64
		var approvedAt sql.NullString

		err := db.QueryRow(`
			SELECT id, order_number, supplier_name, COALESCE(supplier_cnpj,''), COALESCE(buyer_name,''), status, total_value, total_items, flagged_items, notes, approved_by, approved_at::text, created_at
			FROM purchase_orders WHERE id = $1 AND company_id = $2
		`, orderID, companyID).Scan(&order.ID, &order.OrderNumber, &order.SupplierName, &order.SupplierCNPJ, &order.BuyerName, &order.Status, &order.TotalValue, &order.TotalItems, &order.FlaggedItems, &notes, &approvedBy, &approvedAt, &order.CreatedAt)

		if err == sql.ErrNoRows {
			http.Error(w, "Order not found", http.StatusNotFound)
			return
		} else if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}

		if notes.Valid {
			order.Notes = &notes.String
		}
		if approvedAt.Valid {
			order.ApprovedAt = &approvedAt.String
		}

		// Get items with product details (JOIN to get branch data)
		rows, err := db.Query(`
			SELECT poi.id, poi.order_id, poi.product_code, COALESCE(poi.product_description,''),
				poi.quantity, poi.unit_price, poi.total_price, poi.stock_days, poi.current_stock,
				poi.avg_daily_sales, poi.is_low_turnover, poi.item_status, poi.rejection_reason,
				COALESCE(p.stock_filial_01,0), COALESCE(p.stock_filial_02,0), COALESCE(p.stock_filial_03,0),
				COALESCE(p.avg_daily_sales_filial_01,0), COALESCE(p.avg_daily_sales_filial_02,0), COALESCE(p.avg_daily_sales_filial_03,0),
				COALESCE(p.stock_days_filial_01,0), COALESCE(p.stock_days_filial_02,0), COALESCE(p.stock_days_filial_03,0),
				COALESCE(p.seasonality_type,'media'), COALESCE(p.peak_months,''),
				COALESCE(p.supplier_lead_time_days,7), COALESCE(p.min_stock_days,15), COALESCE(p.max_stock_days,90)
			FROM purchase_order_items poi
			LEFT JOIN products p ON p.id = poi.product_id
			WHERE poi.order_id = $1
			ORDER BY poi.is_low_turnover DESC, poi.stock_days DESC
		`, orderID)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var items []PurchaseOrderItem
		for rows.Next() {
			var item PurchaseOrderItem
			var rejReason sql.NullString
			if err := rows.Scan(
				&item.ID, &item.OrderID, &item.ProductCode, &item.ProductDescription,
				&item.Quantity, &item.UnitPrice, &item.TotalPrice, &item.StockDays, &item.CurrentStock,
				&item.AvgDailySales, &item.IsLowTurnover, &item.ItemStatus, &rejReason,
				&item.StockFilial01, &item.StockFilial02, &item.StockFilial03,
				&item.AvgDailySalesFilial01, &item.AvgDailySalesFilial02, &item.AvgDailySalesFilial03,
				&item.StockDaysFilial01, &item.StockDaysFilial02, &item.StockDaysFilial03,
				&item.SeasonalityType, &item.PeakMonths,
				&item.SupplierLeadTimeDays, &item.MinStockDays, &item.MaxStockDays,
			); err != nil {
				continue
			}
			if rejReason.Valid {
				item.RejectionReason = &rejReason.String
			}

			// Calculate coverage post-purchase and risk
			if item.AvgDailySales > 0 {
				item.CoveragePostPurchase = (item.CurrentStock + item.Quantity) / item.AvgDailySales
				item.RiskExcess = item.CoveragePostPurchase > float64(item.MaxStockDays)
			} else if item.CurrentStock+item.Quantity > 0 {
				item.CoveragePostPurchase = 9999
				item.RiskExcess = true
			}

			items = append(items, item)
		}

		if items == nil {
			items = []PurchaseOrderItem{}
		}

		// Get settings for thresholds
		var lowDays, warnDays int
		db.QueryRow("SELECT COALESCE(low_turnover_days,90), COALESCE(warning_turnover_days,60) FROM settings WHERE company_id = $1", companyID).Scan(&lowDays, &warnDays)
		if lowDays == 0 {
			lowDays = 90
		}
		if warnDays == 0 {
			warnDays = 60
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"order":                 order,
			"items":                 items,
			"low_turnover_days":     lowDays,
			"warning_turnover_days": warnDays,
		})
	}
}
