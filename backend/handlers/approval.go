package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

type ApprovalRequest struct {
	Reason string `json:"reason"`
}

// ApproveOrderHandler approves all pending items in an order
func ApproveOrderHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		userID := GetUserIDFromContext(r)

		// /api/orders/{id}/approve
		path := strings.TrimPrefix(r.URL.Path, "/api/orders/")
		parts := strings.Split(path, "/")
		orderID := parts[0]

		// Get user name
		var userName string
		db.QueryRow("SELECT full_name FROM users WHERE id = $1", userID).Scan(&userName)

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		// Verify order belongs to company and is pending
		var status string
		err = tx.QueryRow("SELECT status FROM purchase_orders WHERE id = $1 AND company_id = $2", orderID, companyID).Scan(&status)
		if err == sql.ErrNoRows {
			http.Error(w, "Order not found", http.StatusNotFound)
			return
		}
		if status != "pendente" {
			http.Error(w, "Order is not pending", http.StatusBadRequest)
			return
		}

		// Approve all pending items
		_, err = tx.Exec("UPDATE purchase_order_items SET item_status = 'aprovado' WHERE order_id = $1 AND item_status = 'pendente'", orderID)
		if err != nil {
			http.Error(w, "Error approving items", http.StatusInternalServerError)
			return
		}

		// Update order status
		_, err = tx.Exec("UPDATE purchase_orders SET status = 'aprovado', approved_by = $1, approved_at = NOW() WHERE id = $2", userID, orderID)
		if err != nil {
			http.Error(w, "Error updating order", http.StatusInternalServerError)
			return
		}

		// Record history
		_, _ = tx.Exec(`
			INSERT INTO approval_history (order_id, action, user_id, user_name, reason, created_at)
			VALUES ($1, 'aprovado', $2, $3, 'Pedido aprovado integralmente', NOW())
		`, orderID, userID, userName)

		if err := tx.Commit(); err != nil {
			http.Error(w, "Error committing", http.StatusInternalServerError)
			return
		}

		log.Printf("[Approval] Order %s approved by user %s", orderID, userID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Pedido aprovado com sucesso"})
	}
}

// RejectOrderHandler rejects all pending items in an order
func RejectOrderHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		userID := GetUserIDFromContext(r)

		path := strings.TrimPrefix(r.URL.Path, "/api/orders/")
		parts := strings.Split(path, "/")
		orderID := parts[0]

		var req ApprovalRequest
		json.NewDecoder(r.Body).Decode(&req)
		if req.Reason == "" {
			http.Error(w, "Motivo da reprovação é obrigatório", http.StatusBadRequest)
			return
		}

		var userName string
		db.QueryRow("SELECT full_name FROM users WHERE id = $1", userID).Scan(&userName)

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		var status string
		err = tx.QueryRow("SELECT status FROM purchase_orders WHERE id = $1 AND company_id = $2", orderID, companyID).Scan(&status)
		if err == sql.ErrNoRows {
			http.Error(w, "Order not found", http.StatusNotFound)
			return
		}
		if status != "pendente" {
			http.Error(w, "Order is not pending", http.StatusBadRequest)
			return
		}

		_, err = tx.Exec("UPDATE purchase_order_items SET item_status = 'reprovado', rejection_reason = $1 WHERE order_id = $2 AND item_status = 'pendente'", req.Reason, orderID)
		if err != nil {
			http.Error(w, "Error rejecting items", http.StatusInternalServerError)
			return
		}

		_, err = tx.Exec("UPDATE purchase_orders SET status = 'reprovado', approved_by = $1, approved_at = NOW(), notes = $2 WHERE id = $3", userID, req.Reason, orderID)
		if err != nil {
			http.Error(w, "Error updating order", http.StatusInternalServerError)
			return
		}

		_, _ = tx.Exec(`
			INSERT INTO approval_history (order_id, action, user_id, user_name, reason, created_at)
			VALUES ($1, 'reprovado', $2, $3, $4, NOW())
		`, orderID, userID, userName, req.Reason)

		if err := tx.Commit(); err != nil {
			http.Error(w, "Error committing", http.StatusInternalServerError)
			return
		}

		log.Printf("[Approval] Order %s rejected by user %s: %s", orderID, userID, req.Reason)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Pedido reprovado"})
	}
}

// ApproveItemHandler approves a single item in an order
func ApproveItemHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		userID := GetUserIDFromContext(r)

		// /api/orders/{id}/items/{itemId}/approve
		path := strings.TrimPrefix(r.URL.Path, "/api/orders/")
		parts := strings.Split(path, "/")
		if len(parts) < 4 {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
		orderID := parts[0]
		itemID := parts[2]

		var userName string
		db.QueryRow("SELECT full_name FROM users WHERE id = $1", userID).Scan(&userName)

		// Verify order belongs to company
		var exists bool
		db.QueryRow("SELECT EXISTS(SELECT 1 FROM purchase_orders WHERE id = $1 AND company_id = $2)", orderID, companyID).Scan(&exists)
		if !exists {
			http.Error(w, "Order not found", http.StatusNotFound)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		_, err = tx.Exec("UPDATE purchase_order_items SET item_status = 'aprovado' WHERE id = $1 AND order_id = $2", itemID, orderID)
		if err != nil {
			http.Error(w, "Error approving item", http.StatusInternalServerError)
			return
		}

		_, _ = tx.Exec(`
			INSERT INTO approval_history (order_id, item_id, action, user_id, user_name, created_at)
			VALUES ($1, $2, 'aprovado', $3, $4, NOW())
		`, orderID, itemID, userID, userName)

		// Check if all items are now approved/rejected to update order status
		updateOrderStatus(tx, orderID, userID)

		if err := tx.Commit(); err != nil {
			http.Error(w, "Error committing", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Item aprovado"})
	}
}

// RejectItemHandler rejects a single item in an order
func RejectItemHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		userID := GetUserIDFromContext(r)

		path := strings.TrimPrefix(r.URL.Path, "/api/orders/")
		parts := strings.Split(path, "/")
		if len(parts) < 4 {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
		orderID := parts[0]
		itemID := parts[2]

		var req ApprovalRequest
		json.NewDecoder(r.Body).Decode(&req)
		if req.Reason == "" {
			http.Error(w, "Motivo da reprovação é obrigatório", http.StatusBadRequest)
			return
		}

		var userName string
		db.QueryRow("SELECT full_name FROM users WHERE id = $1", userID).Scan(&userName)

		var exists bool
		db.QueryRow("SELECT EXISTS(SELECT 1 FROM purchase_orders WHERE id = $1 AND company_id = $2)", orderID, companyID).Scan(&exists)
		if !exists {
			http.Error(w, "Order not found", http.StatusNotFound)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		_, err = tx.Exec("UPDATE purchase_order_items SET item_status = 'reprovado', rejection_reason = $1 WHERE id = $2 AND order_id = $3", req.Reason, itemID, orderID)
		if err != nil {
			http.Error(w, "Error rejecting item", http.StatusInternalServerError)
			return
		}

		_, _ = tx.Exec(`
			INSERT INTO approval_history (order_id, item_id, action, user_id, user_name, reason, created_at)
			VALUES ($1, $2, 'reprovado', $3, $4, $5, NOW())
		`, orderID, itemID, userID, userName, req.Reason)

		updateOrderStatus(tx, orderID, userID)

		if err := tx.Commit(); err != nil {
			http.Error(w, "Error committing", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Item reprovado"})
	}
}

// updateOrderStatus checks if all items are resolved and updates order status
func updateOrderStatus(tx *sql.Tx, orderID, userID string) {
	var pendingCount, approvedCount, rejectedCount int
	tx.QueryRow("SELECT COUNT(*) FROM purchase_order_items WHERE order_id = $1 AND item_status = 'pendente'", orderID).Scan(&pendingCount)
	tx.QueryRow("SELECT COUNT(*) FROM purchase_order_items WHERE order_id = $1 AND item_status = 'aprovado'", orderID).Scan(&approvedCount)
	tx.QueryRow("SELECT COUNT(*) FROM purchase_order_items WHERE order_id = $1 AND item_status = 'reprovado'", orderID).Scan(&rejectedCount)

	if pendingCount == 0 {
		var newStatus string
		if rejectedCount == 0 {
			newStatus = "aprovado"
		} else if approvedCount == 0 {
			newStatus = "reprovado"
		} else {
			newStatus = "aprovado_parcial"
		}
		tx.Exec("UPDATE purchase_orders SET status = $1, approved_by = $2, approved_at = NOW() WHERE id = $3", newStatus, userID, orderID)
	}
}
