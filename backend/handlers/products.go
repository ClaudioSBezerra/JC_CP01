package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
)

type Product struct {
	ID                    int     `json:"id"`
	Code                  string  `json:"code"`
	EAN                   string  `json:"ean"`
	Description           string  `json:"description"`
	Category              string  `json:"category"`
	Unit                  string  `json:"unit"`
	CurrentStock          float64 `json:"current_stock"`
	AvgDailySales         float64 `json:"avg_daily_sales"`
	StockDays             float64 `json:"stock_days"`
	CostPrice             float64 `json:"cost_price"`
	LastPurchaseDate      *string `json:"last_purchase_date"`
	LastSaleDate          *string `json:"last_sale_date"`
	UpdatedAt             string  `json:"updated_at"`
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
}

const productSelectCols = `id, code, COALESCE(ean,''), description, COALESCE(category,''), unit,
	current_stock, avg_daily_sales, stock_days, cost_price, last_purchase_date::text, last_sale_date::text, updated_at,
	COALESCE(stock_filial_01,0), COALESCE(stock_filial_02,0), COALESCE(stock_filial_03,0),
	COALESCE(avg_daily_sales_filial_01,0), COALESCE(avg_daily_sales_filial_02,0), COALESCE(avg_daily_sales_filial_03,0),
	COALESCE(stock_days_filial_01,0), COALESCE(stock_days_filial_02,0), COALESCE(stock_days_filial_03,0),
	COALESCE(seasonality_type,'media'), COALESCE(peak_months,''),
	COALESCE(supplier_lead_time_days,7), COALESCE(min_stock_days,15), COALESCE(max_stock_days,90)`

func scanProduct(rows interface{ Scan(...interface{}) error }) (Product, error) {
	var p Product
	var lpd, lsd sql.NullString
	err := rows.Scan(
		&p.ID, &p.Code, &p.EAN, &p.Description, &p.Category, &p.Unit,
		&p.CurrentStock, &p.AvgDailySales, &p.StockDays, &p.CostPrice, &lpd, &lsd, &p.UpdatedAt,
		&p.StockFilial01, &p.StockFilial02, &p.StockFilial03,
		&p.AvgDailySalesFilial01, &p.AvgDailySalesFilial02, &p.AvgDailySalesFilial03,
		&p.StockDaysFilial01, &p.StockDaysFilial02, &p.StockDaysFilial03,
		&p.SeasonalityType, &p.PeakMonths,
		&p.SupplierLeadTimeDays, &p.MinStockDays, &p.MaxStockDays,
	)
	if err != nil {
		return p, err
	}
	if lpd.Valid {
		p.LastPurchaseDate = &lpd.String
	}
	if lsd.Valid {
		p.LastSaleDate = &lsd.String
	}
	return p, nil
}

func ListProductsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		if page < 1 {
			page = 1
		}
		limit := 50
		offset := (page - 1) * limit

		search := r.URL.Query().Get("search")
		category := r.URL.Query().Get("category")
		filial := r.URL.Query().Get("filial") // "", "01", "02", "03"

		// Choose sort column based on filial filter
		sortCol := "stock_days"
		switch filial {
		case "01":
			sortCol = "COALESCE(stock_days_filial_01,0)"
		case "02":
			sortCol = "COALESCE(stock_days_filial_02,0)"
		case "03":
			sortCol = "COALESCE(stock_days_filial_03,0)"
		}

		query := `SELECT ` + productSelectCols + ` FROM products WHERE company_id = $1`
		countQuery := `SELECT COUNT(*) FROM products WHERE company_id = $1`
		args := []interface{}{companyID}
		argIdx := 2

		if search != "" {
			query += ` AND (code ILIKE $` + strconv.Itoa(argIdx) + ` OR description ILIKE $` + strconv.Itoa(argIdx) + `)`
			countQuery += ` AND (code ILIKE $` + strconv.Itoa(argIdx) + ` OR description ILIKE $` + strconv.Itoa(argIdx) + `)`
			args = append(args, "%"+search+"%")
			argIdx++
		}

		if category != "" {
			query += ` AND category = $` + strconv.Itoa(argIdx)
			countQuery += ` AND category = $` + strconv.Itoa(argIdx)
			args = append(args, category)
			argIdx++
		}

		var total int
		db.QueryRow(countQuery, args...).Scan(&total)

		query += ` ORDER BY ` + sortCol + ` DESC, code ASC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
		args = append(args, limit, offset)

		rows, err := db.Query(query, args...)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var products []Product
		for rows.Next() {
			p, err := scanProduct(rows)
			if err != nil {
				continue
			}
			products = append(products, p)
		}

		if products == nil {
			products = []Product{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"products": products,
			"total":    total,
			"page":     page,
			"limit":    limit,
		})
	}
}

// ClearProductsHandler deletes all products for the authenticated company.
func ClearProductsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete && r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		// Remove product FK references from order items before deleting products
		db.Exec(`
			UPDATE purchase_order_items poi SET product_id = NULL
			WHERE EXISTS (
				SELECT 1 FROM purchase_orders po
				WHERE po.id = poi.order_id AND po.company_id = $1
			)
		`, companyID)

		res, err := db.Exec(`DELETE FROM products WHERE company_id = $1`, companyID)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}

		deleted, _ := res.RowsAffected()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"deleted": deleted,
			"message": strconv.FormatInt(deleted, 10) + " produtos removidos com sucesso.",
		})
	}
}

func LowTurnoverProductsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		var lowDays int
		err := db.QueryRow("SELECT COALESCE(low_turnover_days, 90) FROM settings WHERE company_id = $1", companyID).Scan(&lowDays)
		if err != nil {
			lowDays = 90
		}

		rows, err := db.Query(`
			SELECT `+productSelectCols+`
			FROM products
			WHERE company_id = $1 AND stock_days >= $2
			ORDER BY stock_days DESC
			LIMIT 100
		`, companyID, lowDays)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var products []Product
		for rows.Next() {
			p, err := scanProduct(rows)
			if err != nil {
				continue
			}
			products = append(products, p)
		}

		if products == nil {
			products = []Product{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(products)
	}
}
