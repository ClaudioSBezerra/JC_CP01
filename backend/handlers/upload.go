package handlers

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
)

type ImportResult struct {
	TotalRows    int      `json:"total_rows"`
	Imported     int      `json:"imported"`
	Skipped      int      `json:"skipped"`
	Errors       []string `json:"errors,omitempty"`
	Message      string   `json:"message"`
}

// ImportProductsHandler handles CSV upload for products
// Supports TWO formats:
// Legacy (10 cols): CODIGO;EAN;DESCRICAO;CATEGORIA;UNIDADE;ESTOQUE_ATUAL;VENDA_MEDIA_DIARIA;PRECO_CUSTO;DT_ULTIMA_COMPRA;DT_ULTIMA_VENDA
// Sprint2 (21 cols): CODIGO;EAN;DESCRICAO;CATEGORIA;UNIDADE;EST_FIL01;EST_FIL02;EST_FIL03;EST_GERAL;VMD_FIL01;VMD_FIL02;VMD_FIL03;VMD_GERAL;PRECO_CUSTO;PRAZO_ENTREGA;EST_MIN_DDV;EST_MAX_DDV;SAZONALIDADE;MESES_PICO;DT_ULT_COMPRA;DT_ULT_VENDA
func ImportProductsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found in context", http.StatusBadRequest)
			return
		}

		if err := r.ParseMultipartForm(10 << 20); err != nil {
			http.Error(w, "Error parsing form: "+err.Error(), http.StatusBadRequest)
			return
		}

		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "Error reading file: "+err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()

		scanner := bufio.NewScanner(file)
		result := ImportResult{}
		lineNum := 0
		imported := 0
		skipped := 0
		var errors []string
		isNewFormat := false

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		for scanner.Scan() {
			lineNum++
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}

			// Detect format from header
			if lineNum == 1 {
				upper := strings.ToUpper(line)
				if strings.HasPrefix(upper, "CODIGO") || strings.HasPrefix(upper, "COD") {
					if strings.Contains(upper, "EST_FIL01") || strings.Contains(upper, "VMD_FIL01") {
						isNewFormat = true
					}
					continue
				}
			}

			fields := strings.Split(line, ";")

			if isNewFormat {
				// Sprint 2 format: 21 columns
				if len(fields) < 13 {
					errors = append(errors, fmt.Sprintf("Linha %d: campos insuficientes (%d)", lineNum, len(fields)))
					skipped++
					continue
				}

				code := strings.TrimSpace(fields[0])
				ean := strings.TrimSpace(fields[1])
				description := strings.TrimSpace(fields[2])
				category := strings.TrimSpace(fields[3])
				unit := strings.TrimSpace(fields[4])
				if unit == "" {
					unit = "UN"
				}

				stockFil01 := parseFloat(fields[5])
				stockFil02 := parseFloat(fields[6])
				stockFil03 := parseFloat(fields[7])
				stockGeral := parseFloat(fields[8])
				vmdFil01 := parseFloat(fields[9])
				vmdFil02 := parseFloat(fields[10])
				vmdFil03 := parseFloat(fields[11])
				vmdGeral := parseFloat(fields[12])

				costPrice := 0.0
				if len(fields) > 13 {
					costPrice = parseFloat(fields[13])
				}
				leadTime := 7
				if len(fields) > 14 && strings.TrimSpace(fields[14]) != "" {
					lt, _ := strconv.Atoi(strings.TrimSpace(fields[14]))
					if lt > 0 {
						leadTime = lt
					}
				}
				minDDV := 15
				if len(fields) > 15 && strings.TrimSpace(fields[15]) != "" {
					m, _ := strconv.Atoi(strings.TrimSpace(fields[15]))
					if m > 0 {
						minDDV = m
					}
				}
				maxDDV := 90
				if len(fields) > 16 && strings.TrimSpace(fields[16]) != "" {
					m, _ := strconv.Atoi(strings.TrimSpace(fields[16]))
					if m > 0 {
						maxDDV = m
					}
				}
\t\t\t\tseasonality := ""
				if len(fields) > 17 && strings.TrimSpace(fields[17]) != "" {
					seasonality = strings.TrimSpace(fields[17])
				}
				peakMonths := ""
				if len(fields) > 18 {
					peakMonths = strings.TrimSpace(fields[18])
				}
				lastPurchaseDate := sql.NullString{}
				if len(fields) > 19 && strings.TrimSpace(fields[19]) != "" {
					lastPurchaseDate = sql.NullString{String: strings.TrimSpace(fields[19]), Valid: true}
				}
				lastSaleDate := sql.NullString{}
				if len(fields) > 20 && strings.TrimSpace(fields[20]) != "" {
					lastSaleDate = sql.NullString{String: strings.TrimSpace(fields[20]), Valid: true}
				}

				// Calculate stock_days for each branch and general
				stockDaysGeral := calcStockDays(stockGeral, vmdGeral)
				stockDaysFil01 := calcStockDays(stockFil01, vmdFil01)
				stockDaysFil02 := calcStockDays(stockFil02, vmdFil02)
				stockDaysFil03 := calcStockDays(stockFil03, vmdFil03)

				if code == "" || description == "" {
					errors = append(errors, fmt.Sprintf("Linha %d: codigo ou descricao vazio", lineNum))
					skipped++
					continue
				}

				_, err := tx.Exec(`
					INSERT INTO products (company_id, code, ean, description, category, unit,
						current_stock, avg_daily_sales, stock_days, cost_price,
						stock_filial_01, stock_filial_02, stock_filial_03,
						avg_daily_sales_filial_01, avg_daily_sales_filial_02, avg_daily_sales_filial_03,
						stock_days_filial_01, stock_days_filial_02, stock_days_filial_03,
						seasonality_type, peak_months,
						supplier_lead_time_days, min_stock_days, max_stock_days,
						last_purchase_date, last_sale_date, updated_at)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::date,$26::date,NOW())
					ON CONFLICT (company_id, code) DO UPDATE SET
						ean=EXCLUDED.ean, description=EXCLUDED.description, category=EXCLUDED.category, unit=EXCLUDED.unit,
						current_stock=EXCLUDED.current_stock, avg_daily_sales=EXCLUDED.avg_daily_sales, stock_days=EXCLUDED.stock_days, cost_price=EXCLUDED.cost_price,
						stock_filial_01=EXCLUDED.stock_filial_01, stock_filial_02=EXCLUDED.stock_filial_02, stock_filial_03=EXCLUDED.stock_filial_03,
						avg_daily_sales_filial_01=EXCLUDED.avg_daily_sales_filial_01, avg_daily_sales_filial_02=EXCLUDED.avg_daily_sales_filial_02, avg_daily_sales_filial_03=EXCLUDED.avg_daily_sales_filial_03,
						stock_days_filial_01=EXCLUDED.stock_days_filial_01, stock_days_filial_02=EXCLUDED.stock_days_filial_02, stock_days_filial_03=EXCLUDED.stock_days_filial_03,
						seasonality_type=EXCLUDED.seasonality_type, peak_months=EXCLUDED.peak_months,
						supplier_lead_time_days=EXCLUDED.supplier_lead_time_days, min_stock_days=EXCLUDED.min_stock_days, max_stock_days=EXCLUDED.max_stock_days,
						last_purchase_date=EXCLUDED.last_purchase_date, last_sale_date=EXCLUDED.last_sale_date, updated_at=NOW()
				`, companyID, code, ean, description, category, unit,
					stockGeral, vmdGeral, stockDaysGeral, costPrice,
					stockFil01, stockFil02, stockFil03,
					vmdFil01, vmdFil02, vmdFil03,
					stockDaysFil01, stockDaysFil02, stockDaysFil03,
					seasonality, peakMonths,
					leadTime, minDDV, maxDDV,
					lastPurchaseDate, lastSaleDate)

				if err != nil {
					errors = append(errors, fmt.Sprintf("Linha %d: %v", lineNum, err))
					skipped++
					continue
				}
				imported++

			} else {
				// Legacy format: 10 columns
				if len(fields) < 7 {
					errors = append(errors, fmt.Sprintf("Linha %d: numero insuficiente de campos (%d)", lineNum, len(fields)))
					skipped++
					continue
				}

				code := strings.TrimSpace(fields[0])
				ean := ""
				if len(fields) > 1 {
					ean = strings.TrimSpace(fields[1])
				}
				description := strings.TrimSpace(fields[2])
				category := ""
				if len(fields) > 3 {
					category = strings.TrimSpace(fields[3])
				}
				unit := "UN"
				if len(fields) > 4 && strings.TrimSpace(fields[4]) != "" {
					unit = strings.TrimSpace(fields[4])
				}

				currentStock := parseFloat(fields[5])
				avgDailySales := parseFloat(fields[6])

				costPrice := 0.0
				if len(fields) > 7 {
					costPrice = parseFloat(fields[7])
				}

				lastPurchaseDate := sql.NullString{}
				if len(fields) > 8 && strings.TrimSpace(fields[8]) != "" {
					lastPurchaseDate = sql.NullString{String: strings.TrimSpace(fields[8]), Valid: true}
				}

				lastSaleDate := sql.NullString{}
				if len(fields) > 9 && strings.TrimSpace(fields[9]) != "" {
					lastSaleDate = sql.NullString{String: strings.TrimSpace(fields[9]), Valid: true}
				}

				stockDays := calcStockDays(currentStock, avgDailySales)

				if code == "" || description == "" {
					errors = append(errors, fmt.Sprintf("Linha %d: codigo ou descricao vazio", lineNum))
					skipped++
					continue
				}

				_, err := tx.Exec(`
					INSERT INTO products (company_id, code, ean, description, category, unit, current_stock, avg_daily_sales, stock_days, cost_price, last_purchase_date, last_sale_date, updated_at)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::date, $12::date, NOW())
					ON CONFLICT (company_id, code) DO UPDATE SET
						ean = EXCLUDED.ean, description = EXCLUDED.description, category = EXCLUDED.category, unit = EXCLUDED.unit,
						current_stock = EXCLUDED.current_stock, avg_daily_sales = EXCLUDED.avg_daily_sales, stock_days = EXCLUDED.stock_days,
						cost_price = EXCLUDED.cost_price, last_purchase_date = EXCLUDED.last_purchase_date, last_sale_date = EXCLUDED.last_sale_date, updated_at = NOW()
				`, companyID, code, ean, description, category, unit, currentStock, avgDailySales, stockDays, costPrice, lastPurchaseDate, lastSaleDate)

				if err != nil {
					errors = append(errors, fmt.Sprintf("Linha %d: %v", lineNum, err))
					skipped++
					continue
				}
				imported++
			}
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "Error committing transaction", http.StatusInternalServerError)
			return
		}

		result.TotalRows = lineNum
		result.Imported = imported
		result.Skipped = skipped
		result.Errors = errors
		formatStr := "%d produtos importados com sucesso"
		if isNewFormat {
			formatStr += " (formato v2 com filiais)"
		}
		formatStr += ". %d ignorados."
		result.Message = fmt.Sprintf(formatStr, imported, skipped)

		log.Printf("[ImportProducts] Company %s: %d imported, %d skipped (newFormat=%v)", companyID, imported, skipped, isNewFormat)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

// ImportOrdersHandler handles CSV upload for purchase orders
// Expected format (semicolon-separated):
// NUM_PEDIDO;FORNECEDOR;CNPJ_FORNECEDOR;COMPRADOR;COD_PRODUTO;DESCRICAO;QTD;PRECO_UNIT
func ImportOrdersHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		userID := GetUserIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found in context", http.StatusBadRequest)
			return
		}

		if err := r.ParseMultipartForm(10 << 20); err != nil {
			http.Error(w, "Error parsing form: "+err.Error(), http.StatusBadRequest)
			return
		}

		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "Error reading file: "+err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()

		// Get company settings for turnover threshold
		var lowTurnoverDays, warningDays int
		err = db.QueryRow("SELECT COALESCE(low_turnover_days, 90), COALESCE(warning_turnover_days, 60) FROM settings WHERE company_id = $1", companyID).Scan(&lowTurnoverDays, &warningDays)
		if err != nil {
			lowTurnoverDays = 90
			warningDays = 60
		}

		scanner := bufio.NewScanner(file)
		lineNum := 0
		var errors []string

		type OrderItem struct {
			OrderNumber  string
			Supplier     string
			SupplierCNPJ string
			Buyer        string
			ProductCode  string
			Description  string
			Quantity     float64
			UnitPrice    float64
		}

		orderItems := make(map[string][]OrderItem)
		orderMeta := make(map[string]OrderItem)

		for scanner.Scan() {
			lineNum++
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}

			if lineNum == 1 && (strings.HasPrefix(strings.ToUpper(line), "NUM") || strings.HasPrefix(strings.ToUpper(line), "PEDIDO")) {
				continue
			}

			fields := strings.Split(line, ";")
			if len(fields) < 8 {
				errors = append(errors, fmt.Sprintf("Linha %d: campos insuficientes (%d)", lineNum, len(fields)))
				continue
			}

			item := OrderItem{
				OrderNumber:  strings.TrimSpace(fields[0]),
				Supplier:     strings.TrimSpace(fields[1]),
				SupplierCNPJ: strings.TrimSpace(fields[2]),
				Buyer:        strings.TrimSpace(fields[3]),
				ProductCode:  strings.TrimSpace(fields[4]),
				Description:  strings.TrimSpace(fields[5]),
				Quantity:     parseFloat(fields[6]),
				UnitPrice:    parseFloat(fields[7]),
			}

			orderItems[item.OrderNumber] = append(orderItems[item.OrderNumber], item)
			if _, exists := orderMeta[item.OrderNumber]; !exists {
				orderMeta[item.OrderNumber] = item
			}
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		ordersCreated := 0
		itemsCreated := 0

		for orderNum, items := range orderItems {
			meta := orderMeta[orderNum]
			totalValue := 0.0
			flaggedItems := 0

			for _, item := range items {
				totalValue += item.Quantity * item.UnitPrice
			}

			var orderID int
			err := tx.QueryRow(`
				INSERT INTO purchase_orders (company_id, order_number, supplier_name, supplier_cnpj, buyer_id, buyer_name, status, total_value, total_items, flagged_items, created_at)
				VALUES ($1, $2, $3, $4, $5, $6, 'pendente', $7, $8, 0, NOW())
				RETURNING id
			`, companyID, orderNum, meta.Supplier, meta.SupplierCNPJ, userID, meta.Buyer, totalValue, len(items)).Scan(&orderID)

			if err != nil {
				errors = append(errors, fmt.Sprintf("Pedido %s: erro ao criar - %v", orderNum, err))
				continue
			}

			for _, item := range items {
				totalPrice := item.Quantity * item.UnitPrice

				var productID sql.NullInt64
				var stockDays, currentStock, avgDailySales float64

				err := db.QueryRow(`
					SELECT id, stock_days, current_stock, avg_daily_sales
					FROM products WHERE company_id = $1 AND code = $2
				`, companyID, item.ProductCode).Scan(&productID, &stockDays, &currentStock, &avgDailySales)

				if err != nil {
					stockDays = 0
					currentStock = 0
					avgDailySales = 0
				}

				isLowTurnover := stockDays >= float64(lowTurnoverDays)
				if isLowTurnover {
					flaggedItems++
				}

				_, err = tx.Exec(`
					INSERT INTO purchase_order_items (order_id, product_id, product_code, product_description, quantity, unit_price, total_price, stock_days, current_stock, avg_daily_sales, is_low_turnover, item_status)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pendente')
				`, orderID, productID, item.ProductCode, item.Description, item.Quantity, item.UnitPrice, totalPrice, stockDays, currentStock, avgDailySales, isLowTurnover)

				if err != nil {
					errors = append(errors, fmt.Sprintf("Item %s no pedido %s: %v", item.ProductCode, orderNum, err))
					continue
				}
				itemsCreated++
			}

			_, _ = tx.Exec("UPDATE purchase_orders SET flagged_items = $1 WHERE id = $2", flaggedItems, orderID)
			ordersCreated++
		}

		if err := tx.Commit(); err != nil {
			http.Error(w, "Error committing transaction", http.StatusInternalServerError)
			return
		}

		result := ImportResult{
			TotalRows: lineNum,
			Imported:  itemsCreated,
			Skipped:   len(errors),
			Errors:    errors,
			Message:   fmt.Sprintf("%d pedidos criados com %d itens. %d erros.", ordersCreated, itemsCreated, len(errors)),
		}

		log.Printf("[ImportOrders] Company %s: %d orders, %d items created", companyID, ordersCreated, itemsCreated)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}

func parseFloat(s string) float64 {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, ",", ".")
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func calcStockDays(stock, avgDailySales float64) float64 {
	if avgDailySales > 0 {
		return math.Round(stock/avgDailySales*10) / 10
	}
	if stock > 0 {
		return 9999
	}
	return 0
}
