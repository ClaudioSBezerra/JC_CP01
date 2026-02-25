package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
)

type ApprovalHistoryEntry struct {
	ID          int     `json:"id"`
	OrderID     int     `json:"order_id"`
	OrderNumber string  `json:"order_number"`
	ItemID      *int    `json:"item_id"`
	ProductCode *string `json:"product_code"`
	Action      string  `json:"action"`
	UserName    string  `json:"user_name"`
	Reason      *string `json:"reason"`
	CreatedAt   string  `json:"created_at"`
}

func ListApprovalHistoryHandler(db *sql.DB) http.HandlerFunc {
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

		status := r.URL.Query().Get("status")
		buyer := r.URL.Query().Get("buyer")
		dateFrom := r.URL.Query().Get("date_from")
		dateTo := r.URL.Query().Get("date_to")

		query := `
			SELECT ah.id, ah.order_id, po.order_number, ah.item_id, poi.product_code, ah.action, COALESCE(ah.user_name,''), ah.reason, ah.created_at
			FROM approval_history ah
			JOIN purchase_orders po ON ah.order_id = po.id
			LEFT JOIN purchase_order_items poi ON ah.item_id = poi.id
			WHERE po.company_id = $1
		`
		countQuery := `
			SELECT COUNT(*)
			FROM approval_history ah
			JOIN purchase_orders po ON ah.order_id = po.id
			WHERE po.company_id = $1
		`
		args := []interface{}{companyID}
		argIdx := 2

		if status != "" {
			query += ` AND ah.action = $` + strconv.Itoa(argIdx)
			countQuery += ` AND ah.action = $` + strconv.Itoa(argIdx)
			args = append(args, status)
			argIdx++
		}
		if buyer != "" {
			query += ` AND po.buyer_name ILIKE $` + strconv.Itoa(argIdx)
			countQuery += ` AND po.buyer_name ILIKE $` + strconv.Itoa(argIdx)
			args = append(args, "%"+buyer+"%")
			argIdx++
		}
		if dateFrom != "" {
			query += ` AND ah.created_at >= $` + strconv.Itoa(argIdx) + `::date`
			countQuery += ` AND ah.created_at >= $` + strconv.Itoa(argIdx) + `::date`
			args = append(args, dateFrom)
			argIdx++
		}
		if dateTo != "" {
			query += ` AND ah.created_at <= ($` + strconv.Itoa(argIdx) + `::date + interval '1 day')`
			countQuery += ` AND ah.created_at <= ($` + strconv.Itoa(argIdx) + `::date + interval '1 day')`
			args = append(args, dateTo)
			argIdx++
		}

		var total int
		db.QueryRow(countQuery, args...).Scan(&total)

		query += ` ORDER BY ah.created_at DESC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
		args = append(args, limit, offset)

		rows, err := db.Query(query, args...)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var entries []ApprovalHistoryEntry
		for rows.Next() {
			var e ApprovalHistoryEntry
			var itemID sql.NullInt64
			var prodCode, reason sql.NullString
			if err := rows.Scan(&e.ID, &e.OrderID, &e.OrderNumber, &itemID, &prodCode, &e.Action, &e.UserName, &reason, &e.CreatedAt); err != nil {
				continue
			}
			if itemID.Valid {
				id := int(itemID.Int64)
				e.ItemID = &id
			}
			if prodCode.Valid {
				e.ProductCode = &prodCode.String
			}
			if reason.Valid {
				e.Reason = &reason.String
			}
			entries = append(entries, e)
		}

		if entries == nil {
			entries = []ApprovalHistoryEntry{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"history": entries,
			"total":   total,
			"page":    page,
			"limit":   limit,
		})
	}
}
