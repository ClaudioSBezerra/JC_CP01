package handlers

import (
	"bytes"
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
)

// ListUsersHandler handles GET/POST /api/users
// GET  — lista usuários da empresa
// POST — cria novo usuário na mesma empresa do admin
func ListUsersHandler(db *sql.DB) http.HandlerFunc {
	type UserItem struct {
		ID       int    `json:"id"`
		FullName string `json:"full_name"`
		Email    string `json:"email"`
		Role     string `json:"role"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}
		if GetUserRoleFromContext(r) == "rca" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		switch r.Method {
		case http.MethodGet:
			rows, err := db.Query(`
				SELECT id, full_name, email, role
				FROM users
				WHERE company_id = $1
				ORDER BY full_name ASC
			`, companyID)
			if err != nil {
				http.Error(w, "Database error", http.StatusInternalServerError)
				return
			}
			defer rows.Close()
			var users []UserItem
			for rows.Next() {
				var u UserItem
				rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role)
				users = append(users, u)
			}
			if users == nil {
				users = []UserItem{}
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"items": users})

		case http.MethodPost:
			var req struct {
				FullName string `json:"full_name"`
				Email    string `json:"email"`
				Password string `json:"password"`
				Role     string `json:"role"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid JSON", http.StatusBadRequest)
				return
			}
			if strings.TrimSpace(req.FullName) == "" || strings.TrimSpace(req.Email) == "" || len(req.Password) < 6 {
				http.Error(w, "Nome, e-mail e senha (mín. 6 chars) são obrigatórios", http.StatusBadRequest)
				return
			}
			role := req.Role
			if role == "" {
				role = "admin"
			}

			var emailExists bool
			db.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE email=$1)`, strings.ToLower(req.Email)).Scan(&emailExists)
			if emailExists {
				http.Error(w, "E-mail já cadastrado no sistema", http.StatusConflict)
				return
			}

			hash, err := HashPassword(req.Password)
			if err != nil {
				http.Error(w, "Erro ao processar senha", http.StatusInternalServerError)
				return
			}

			var newID int
			err = db.QueryRow(`
				INSERT INTO users (company_id, full_name, email, password_hash, role)
				VALUES ($1, $2, $3, $4, $5)
				RETURNING id
			`, companyID, strings.TrimSpace(req.FullName), strings.ToLower(strings.TrimSpace(req.Email)), hash, role).Scan(&newID)
			if err != nil {
				http.Error(w, "Erro ao criar usuário: "+err.Error(), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"id":      newID,
				"message": "Usuário criado com sucesso",
			})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// UpdateUserRoleHandler handles PUT /api/users/:id/role
func UpdateUserRoleHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" || GetUserRoleFromContext(r) == "rca" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		userID := strings.TrimPrefix(r.URL.Path, "/api/users/")
		userID = strings.TrimSuffix(userID, "/role")

		var req struct {
			Role string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Role == "" {
			http.Error(w, "role é obrigatório", http.StatusBadRequest)
			return
		}

		res, err := db.Exec(`UPDATE users SET role=$1 WHERE id=$2 AND company_id=$3`, req.Role, userID, companyID)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			http.Error(w, "Usuário não encontrado", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Perfil atualizado"})
	}
}

// -----------------------------------------------------------------------
// Domain types
// -----------------------------------------------------------------------

type RCARepresentative struct {
	ID             int     `json:"id"`
	CompanyID      int     `json:"company_id"`
	UserID         int     `json:"user_id"`
	FullName       string  `json:"full_name"`
	Email          string  `json:"email"`
	Phone          string  `json:"phone"`
	VehicleType    string  `json:"vehicle_type"`
	VehiclePlate   string  `json:"vehicle_plate"`
	Territory      string  `json:"territory"`
	IsActive       bool    `json:"is_active"`
	LastCheckinAt  *string `json:"last_checkin_at"`
	RouteCustomers int     `json:"route_customers"`
	TodayVisits    int     `json:"today_visits"`
	TodayCompleted int     `json:"today_completed"`
	CreatedAt      string  `json:"created_at"`
}

type CreateRepresentativeRequest struct {
	// Existing user mode
	UserID int `json:"user_id"`
	// New user inline creation mode (used when user_id == 0)
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	// Profile fields
	VehicleType  string `json:"vehicle_type"`
	VehiclePlate string `json:"vehicle_plate"`
	Territory    string `json:"territory"`
	Phone        string `json:"phone"`
}

type RCARoute struct {
	ID               int    `json:"id"`
	CompanyID        int    `json:"company_id"`
	RepresentativeID int    `json:"representative_id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
	IsActive         bool   `json:"is_active"`
	CustomerCount    int    `json:"customer_count"`
	CreatedAt        string `json:"created_at"`
}

type CreateRouteRequest struct {
	RepresentativeID int    `json:"representative_id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
}

type RCACustomer struct {
	ID               int      `json:"id"`
	CompanyID        int      `json:"company_id"`
	RouteID          int      `json:"route_id"`
	CompanyName      string   `json:"company_name"`
	ContactName      string   `json:"contact_name"`
	Phone            string   `json:"phone"`
	City             string   `json:"city"`
	Neighborhood     string   `json:"neighborhood"`
	Address          string   `json:"address"`
	AddressNumber    string   `json:"address_number"`
	Lat              *float64 `json:"lat"`
	Lng              *float64 `json:"lng"`
	Priority         int      `json:"priority"`
	Notes            string   `json:"notes"`
	IsActive         bool     `json:"is_active"`
	TodayVisitID     *int     `json:"today_visit_id,omitempty"`
	TodayVisitStatus *string  `json:"today_visit_status,omitempty"`
	CreatedAt        string   `json:"created_at"`
}

type AddCustomerRequest struct {
	CompanyName   string   `json:"company_name"`
	ContactName   string   `json:"contact_name"`
	Phone         string   `json:"phone"`
	City          string   `json:"city"`
	Neighborhood  string   `json:"neighborhood"`
	Address       string   `json:"address"`
	AddressNumber string   `json:"address_number"`
	Lat           *float64 `json:"lat"`
	Lng           *float64 `json:"lng"`
	Priority      int      `json:"priority"`
	Notes         string   `json:"notes"`
}

type RCAVisit struct {
	ID               int      `json:"id"`
	CompanyID        int      `json:"company_id"`
	RepresentativeID int      `json:"representative_id"`
	CustomerID       int      `json:"customer_id"`
	CustomerName     string   `json:"customer_name"`
	// Customer registered address (for map comparison)
	CustomerCity          string   `json:"customer_city"`
	CustomerNeighborhood  string   `json:"customer_neighborhood"`
	CustomerAddress       string   `json:"customer_address"`
	CustomerAddressNumber string   `json:"customer_address_number"`
	CustomerLat           *float64 `json:"customer_lat"`
	CustomerLng           *float64 `json:"customer_lng"`
	VisitDate        string   `json:"visit_date"`
	Status           string   `json:"status"`
	CheckinAt        *string  `json:"checkin_at"`
	CheckinLat       *float64 `json:"checkin_lat"`
	CheckinLng       *float64 `json:"checkin_lng"`
	CheckoutAt       *string  `json:"checkout_at"`
	CheckoutLat      *float64 `json:"checkout_lat"`
	CheckoutLng      *float64 `json:"checkout_lng"`
	DurationMinutes  *int     `json:"duration_minutes"`
	Notes            string   `json:"notes"`
	CreatedAt        string   `json:"created_at"`
}

type CheckinRequest struct {
	CustomerID int     `json:"customer_id"`
	Lat        float64 `json:"lat"`
	Lng        float64 `json:"lng"`
}

type CheckoutRequest struct {
	VisitID int     `json:"visit_id"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	Notes   string  `json:"notes"`
}

type RCADashboard struct {
	TotalActive         int                 `json:"total_active"`
	TotalRouteCustomers int                 `json:"total_route_customers"`
	TotalVisitsToday    int                 `json:"total_visits_today"`
	TotalPending        int                 `json:"total_pending"`
	TotalCompleted      int                 `json:"total_completed"`
	Representatives     []RCARepresentative `json:"representatives"`
}

// -----------------------------------------------------------------------
// Helper
// -----------------------------------------------------------------------

func getRepresentativeID(db *sql.DB, userID, companyID string) (int, error) {
	var repID int
	err := db.QueryRow(
		`SELECT id FROM rca_representatives WHERE user_id = $1 AND company_id = $2 AND is_active = TRUE`,
		userID, companyID,
	).Scan(&repID)
	return repID, err
}

// -----------------------------------------------------------------------
// Admin Handlers
// -----------------------------------------------------------------------

// ListOrCreateRCARepresentativesHandler handles GET and POST /api/rca/representatives
func ListOrCreateRCARepresentativesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		// Block RCA role from admin endpoints
		if GetUserRoleFromContext(r) == "rca" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		switch r.Method {
		case http.MethodGet:
			rows, err := db.Query(`
				SELECT r.id, r.company_id, r.user_id, u.full_name, u.email,
					COALESCE(r.phone,''), COALESCE(r.vehicle_type,''),
					COALESCE(r.vehicle_plate,''), COALESCE(r.territory,''),
					r.is_active, r.created_at::text,
					(SELECT MAX(checkin_at)::text FROM rca_visits WHERE representative_id = r.id) AS last_checkin_at,
					(SELECT COUNT(*) FROM rca_visits WHERE representative_id = r.id AND visit_date = CURRENT_DATE) AS today_visits,
					(SELECT COUNT(*) FROM rca_visits WHERE representative_id = r.id AND visit_date = CURRENT_DATE AND status = 'concluida') AS today_completed
				FROM rca_representatives r
				JOIN users u ON u.id = r.user_id
				WHERE r.company_id = $1
				ORDER BY u.full_name ASC
			`, companyID)
			if err != nil {
				http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			var reps []RCARepresentative
			for rows.Next() {
				var rep RCARepresentative
				var lca sql.NullString
				if err := rows.Scan(
					&rep.ID, &rep.CompanyID, &rep.UserID, &rep.FullName, &rep.Email,
					&rep.Phone, &rep.VehicleType, &rep.VehiclePlate, &rep.Territory,
					&rep.IsActive, &rep.CreatedAt, &lca,
					&rep.TodayVisits, &rep.TodayCompleted,
				); err != nil {
					continue
				}
				if lca.Valid {
					rep.LastCheckinAt = &lca.String
				}
				reps = append(reps, rep)
			}
			if reps == nil {
				reps = []RCARepresentative{}
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"items": reps, "total": len(reps)})

		case http.MethodPost:
			var req CreateRepresentativeRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid JSON", http.StatusBadRequest)
				return
			}

			tx, err := db.Begin()
			if err != nil {
				http.Error(w, "Database error", http.StatusInternalServerError)
				return
			}
			defer tx.Rollback()

			userID := req.UserID

			if userID == 0 {
				// Inline creation: full_name + email + password required
				if strings.TrimSpace(req.FullName) == "" || strings.TrimSpace(req.Email) == "" || len(req.Password) < 6 {
					http.Error(w, "Para criar novo usuário informe nome, e-mail e senha (mínimo 6 caracteres)", http.StatusBadRequest)
					return
				}
				// Check e-mail uniqueness
				var emailExists bool
				tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE email=$1)`, strings.ToLower(req.Email)).Scan(&emailExists)
				if emailExists {
					http.Error(w, "E-mail já cadastrado no sistema", http.StatusConflict)
					return
				}
				hash, err := HashPassword(req.Password)
				if err != nil {
					http.Error(w, "Erro ao processar senha", http.StatusInternalServerError)
					return
				}
				err = tx.QueryRow(`
					INSERT INTO users (company_id, full_name, email, password_hash, role)
					VALUES ($1, $2, $3, $4, 'rca')
					RETURNING id
				`, companyID, strings.TrimSpace(req.FullName), strings.ToLower(strings.TrimSpace(req.Email)), hash).Scan(&userID)
				if err != nil {
					http.Error(w, "Erro ao criar usuário: "+err.Error(), http.StatusInternalServerError)
					return
				}
			} else {
				// Link existing user — verify they belong to this company
				var exists bool
				tx.QueryRow(`SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND company_id=$2)`, userID, companyID).Scan(&exists)
				if !exists {
					http.Error(w, "Usuário não encontrado nesta empresa", http.StatusBadRequest)
					return
				}
				// Promote role to rca
				tx.Exec(`UPDATE users SET role = 'rca' WHERE id = $1 AND company_id = $2`, userID, companyID)
			}

			var repID int
			err = tx.QueryRow(`
				INSERT INTO rca_representatives (company_id, user_id, vehicle_type, vehicle_plate, territory, phone)
				VALUES ($1, $2, $3, $4, $5, $6)
				ON CONFLICT (company_id, user_id) DO UPDATE SET
					vehicle_type = EXCLUDED.vehicle_type,
					vehicle_plate = EXCLUDED.vehicle_plate,
					territory = EXCLUDED.territory,
					phone = EXCLUDED.phone,
					updated_at = NOW()
				RETURNING id
			`, companyID, userID, req.VehicleType, req.VehiclePlate, req.Territory, req.Phone).Scan(&repID)
			if err != nil {
				http.Error(w, "Erro ao criar representante: "+err.Error(), http.StatusInternalServerError)
				return
			}

			if err := tx.Commit(); err != nil {
				http.Error(w, "Erro ao confirmar operação", http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"id": repID, "message": "Representante criado com sucesso"})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// ListOrCreateRCARoutesHandler handles GET ?rca_id=X and POST /api/rca/routes
func ListOrCreateRCARoutesHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		if GetUserRoleFromContext(r) == "rca" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		switch r.Method {
		case http.MethodGet:
			rcaIDStr := r.URL.Query().Get("rca_id")
			if rcaIDStr == "" {
				http.Error(w, "rca_id is required", http.StatusBadRequest)
				return
			}

			rows, err := db.Query(`
				SELECT r.id, r.company_id, r.representative_id, r.name, COALESCE(r.description,''),
					r.is_active, r.created_at::text,
					(SELECT COUNT(*) FROM rca_customers WHERE route_id = r.id AND is_active = TRUE) AS customer_count
				FROM rca_routes r
				WHERE r.company_id = $1 AND r.representative_id = $2
				ORDER BY r.name ASC
			`, companyID, rcaIDStr)
			if err != nil {
				http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
				return
			}
			defer rows.Close()

			var routes []RCARoute
			for rows.Next() {
				var rt RCARoute
				if err := rows.Scan(&rt.ID, &rt.CompanyID, &rt.RepresentativeID, &rt.Name,
					&rt.Description, &rt.IsActive, &rt.CreatedAt, &rt.CustomerCount); err != nil {
					continue
				}
				routes = append(routes, rt)
			}
			if routes == nil {
				routes = []RCARoute{}
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"items": routes, "total": len(routes)})

		case http.MethodPost:
			var req CreateRouteRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "Invalid JSON", http.StatusBadRequest)
				return
			}
			if req.Name == "" || req.RepresentativeID == 0 {
				http.Error(w, "name and representative_id are required", http.StatusBadRequest)
				return
			}

			var routeID int
			err := db.QueryRow(`
				INSERT INTO rca_routes (company_id, representative_id, name, description)
				VALUES ($1, $2, $3, $4)
				RETURNING id
			`, companyID, req.RepresentativeID, req.Name, req.Description).Scan(&routeID)
			if err != nil {
				http.Error(w, "Error creating route: "+err.Error(), http.StatusInternalServerError)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"id": routeID, "message": "Rota criada com sucesso"})

		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}
}

// ListRCARouteCustomersHandler handles GET /api/rca/routes/:id/customers
func ListRCARouteCustomersHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		// Parse route ID from path /api/rca/routes/:id/customers
		path := strings.TrimPrefix(r.URL.Path, "/api/rca/routes/")
		parts := strings.Split(path, "/")
		if len(parts) < 1 {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}
		routeID := parts[0]

		rows, err := db.Query(`
			SELECT id, company_id, route_id, company_name, COALESCE(contact_name,''),
				COALESCE(phone,''), COALESCE(city,''), COALESCE(neighborhood,''),
				COALESCE(address,''), COALESCE(address_number,''),
				lat, lng, priority, COALESCE(notes,''), is_active, created_at::text
			FROM rca_customers
			WHERE route_id = $1 AND company_id = $2 AND is_active = TRUE
			ORDER BY priority ASC
		`, routeID, companyID)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var customers []RCACustomer
		for rows.Next() {
			var c RCACustomer
			var lat, lng sql.NullFloat64
			if err := rows.Scan(&c.ID, &c.CompanyID, &c.RouteID, &c.CompanyName,
				&c.ContactName, &c.Phone, &c.City, &c.Neighborhood,
				&c.Address, &c.AddressNumber, &lat, &lng,
				&c.Priority, &c.Notes, &c.IsActive, &c.CreatedAt); err != nil {
				continue
			}
			if lat.Valid {
				c.Lat = &lat.Float64
			}
			if lng.Valid {
				c.Lng = &lng.Float64
			}
			customers = append(customers, c)
		}
		if customers == nil {
			customers = []RCACustomer{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"items": customers, "total": len(customers)})
	}
}

// AddRCACustomerHandler handles POST /api/rca/routes/:id/customers
func AddRCACustomerHandler(db *sql.DB) http.HandlerFunc {
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

		path := strings.TrimPrefix(r.URL.Path, "/api/rca/routes/")
		parts := strings.Split(path, "/")
		routeID := parts[0]

		var req AddCustomerRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if req.CompanyName == "" {
			http.Error(w, "company_name is required", http.StatusBadRequest)
			return
		}
		if req.Priority == 0 {
			req.Priority = 1
		}

		var custID int
		err := db.QueryRow(`
			INSERT INTO rca_customers (company_id, route_id, company_name, contact_name, phone,
				city, neighborhood, address, address_number, lat, lng, priority, notes)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
			RETURNING id
		`, companyID, routeID, req.CompanyName, req.ContactName, req.Phone,
			req.City, req.Neighborhood, req.Address, req.AddressNumber,
			req.Lat, req.Lng, req.Priority, req.Notes).Scan(&custID)
		if err != nil {
			http.Error(w, "Error adding customer: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"id": custID, "message": "Cliente adicionado com sucesso"})
	}
}

// DeleteRCACustomerHandler handles DELETE /api/rca/customers/:id
func DeleteRCACustomerHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		custID := strings.TrimPrefix(r.URL.Path, "/api/rca/customers/")

		res, err := db.Exec(`
			UPDATE rca_customers SET is_active = FALSE
			WHERE id = $1 AND company_id = $2
		`, custID, companyID)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}

		n, _ := res.RowsAffected()
		if n == 0 {
			http.Error(w, "Customer not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Cliente removido com sucesso"})
	}
}

// ImportRCACustomersHandler handles POST /api/rca/routes/:id/customers/import
// Accepts multipart/form-data with field "file" (CSV).
// CSV columns (header required):
//
//	company_name, contact_name, phone, city, neighborhood, address, address_number, priority, notes
func ImportRCACustomersHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jsonErr := func(msg string, code int) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(code)
			json.NewEncoder(w).Encode(map[string]string{"error": msg})
		}

		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			jsonErr("Sessão inválida. Faça login novamente.", http.StatusUnauthorized)
			return
		}
		if GetUserRoleFromContext(r) == "rca" {
			jsonErr("Sem permissão", http.StatusForbidden)
			return
		}

		// Extract route ID from path: /api/rca/routes/:id/customers/import
		path := strings.TrimPrefix(r.URL.Path, "/api/rca/routes/")
		parts := strings.Split(path, "/")
		if len(parts) < 3 {
			jsonErr("Caminho inválido", http.StatusBadRequest)
			return
		}
		routeID := parts[0]

		// Verify route belongs to company
		var exists bool
		db.QueryRow(`SELECT EXISTS(SELECT 1 FROM rca_routes WHERE id=$1 AND company_id=$2)`, routeID, companyID).Scan(&exists)
		if !exists {
			jsonErr("Rota não encontrada", http.StatusNotFound)
			return
		}

		// Read CSV body directly (text/csv) — avoids multipart/form-data complexity
		data, err := io.ReadAll(r.Body)
		if err != nil {
			jsonErr("Erro ao ler corpo da requisição", http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		// Strip UTF-8 BOM added by Excel
		data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})

		// Autodetect delimiter: Brazilian Excel uses ';'
		delimiter := ','
		if firstLine := strings.SplitN(string(data), "\n", 2)[0]; strings.Count(firstLine, ";") > strings.Count(firstLine, ",") {
			delimiter = ';'
		}

		reader := csv.NewReader(bytes.NewReader(data))
		reader.Comma = rune(delimiter)
		reader.TrimLeadingSpace = true
		reader.LazyQuotes = true
		reader.FieldsPerRecord = -1

		records, err := reader.ReadAll()
		if err != nil {
			jsonErr("CSV inválido: "+err.Error(), http.StatusBadRequest)
			return
		}
		if len(records) < 2 {
			jsonErr("CSV deve ter cabeçalho + pelo menos uma linha de dados", http.StatusBadRequest)
			return
		}

		// Map header columns
		header := records[0]
		idx := map[string]int{}
		for i, h := range header {
			idx[strings.ToLower(strings.TrimSpace(h))] = i
		}
		col := func(row []string, name string) string {
			i, ok := idx[name]
			if !ok || i >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[i])
		}

		tx, err := db.Begin()
		if err != nil {
			jsonErr("Erro de banco de dados", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		imported := 0
		skipped := 0
		for _, row := range records[1:] {
			name := col(row, "company_name")
			if name == "" {
				skipped++
				continue
			}
			priority := 1
			if p, err := strconv.Atoi(col(row, "priority")); err == nil && p > 0 {
				priority = p
			}
			_, err := tx.Exec(`
				INSERT INTO rca_customers
					(company_id, route_id, company_name, contact_name, phone,
					 city, neighborhood, address, address_number, priority, notes)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			`, companyID, routeID,
				name,
				col(row, "contact_name"),
				col(row, "phone"),
				col(row, "city"),
				col(row, "neighborhood"),
				col(row, "address"),
				col(row, "address_number"),
				priority,
				col(row, "notes"),
			)
			if err != nil {
				skipped++
			} else {
				imported++
			}
		}

		if err := tx.Commit(); err != nil {
			jsonErr("Erro ao salvar dados", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"imported": imported,
			"skipped":  skipped,
			"message":  strconv.Itoa(imported) + " cliente(s) importado(s) com sucesso",
		})
	}
}

// GetRCADashboardHandler handles GET /api/rca/dashboard
func GetRCADashboardHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		if GetUserRoleFromContext(r) == "rca" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		rows, err := db.Query(`
			SELECT r.id, r.company_id, r.user_id, u.full_name, u.email,
				COALESCE(r.phone,''), COALESCE(r.vehicle_type,''),
				COALESCE(r.vehicle_plate,''), COALESCE(r.territory,''),
				r.is_active, r.created_at::text,
				(SELECT MAX(checkin_at)::text FROM rca_visits WHERE representative_id = r.id) AS last_checkin_at,
				(SELECT COUNT(*) FROM rca_customers rc
				 JOIN rca_routes rr ON rr.id = rc.route_id
				 WHERE rr.representative_id = r.id AND rr.is_active = TRUE AND rc.is_active = TRUE) AS route_customers,
				(SELECT COUNT(*) FROM rca_visits WHERE representative_id = r.id AND visit_date = CURRENT_DATE) AS today_visits,
				(SELECT COUNT(*) FROM rca_visits WHERE representative_id = r.id AND visit_date = CURRENT_DATE AND status = 'concluida') AS today_completed
			FROM rca_representatives r
			JOIN users u ON u.id = r.user_id
			WHERE r.company_id = $1 AND r.is_active = TRUE
			ORDER BY u.full_name ASC
		`, companyID)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		dashboard := RCADashboard{Representatives: []RCARepresentative{}}
		for rows.Next() {
			var rep RCARepresentative
			var lca sql.NullString
			if err := rows.Scan(
				&rep.ID, &rep.CompanyID, &rep.UserID, &rep.FullName, &rep.Email,
				&rep.Phone, &rep.VehicleType, &rep.VehiclePlate, &rep.Territory,
				&rep.IsActive, &rep.CreatedAt, &lca,
				&rep.RouteCustomers, &rep.TodayVisits, &rep.TodayCompleted,
			); err != nil {
				continue
			}
			if lca.Valid {
				rep.LastCheckinAt = &lca.String
			}
			if rep.IsActive {
				dashboard.TotalActive++
			}
			dashboard.TotalRouteCustomers += rep.RouteCustomers
			dashboard.TotalVisitsToday += rep.TodayVisits
			dashboard.TotalCompleted += rep.TodayCompleted
			dashboard.Representatives = append(dashboard.Representatives, rep)
		}
		dashboard.TotalPending = dashboard.TotalRouteCustomers - dashboard.TotalCompleted

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(dashboard)
	}
}

// GetRCAVisitHistoryHandler handles GET /api/rca/:id/visits?date=YYYY-MM-DD
func GetRCAVisitHistoryHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		if companyID == "" {
			http.Error(w, "Company not found", http.StatusBadRequest)
			return
		}

		if GetUserRoleFromContext(r) == "rca" {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}

		// Parse /api/rca/:id/visits
		path := strings.TrimPrefix(r.URL.Path, "/api/rca/")
		parts := strings.Split(path, "/")
		repID := parts[0]

		date := r.URL.Query().Get("date")
		if date == "" {
			date = "CURRENT_DATE"
		} else {
			date = "'" + date + "'"
		}

		rows, err := db.Query(`
			SELECT v.id, v.company_id, v.representative_id, v.customer_id,
				COALESCE(c.company_name,''), COALESCE(c.city,''), COALESCE(c.neighborhood,''),
				COALESCE(c.address,''), COALESCE(c.address_number,''), c.lat, c.lng,
				v.visit_date::text, v.status,
				v.checkin_at::text, v.checkin_lat, v.checkin_lng,
				v.checkout_at::text, v.checkout_lat, v.checkout_lng,
				v.duration_minutes, COALESCE(v.notes,''), v.created_at::text
			FROM rca_visits v
			JOIN rca_customers c ON c.id = v.customer_id
			WHERE v.representative_id = $1 AND v.company_id = $2
			  AND v.visit_date = `+date+`
			ORDER BY v.checkin_at ASC NULLS LAST
		`, repID, companyID)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var visits []RCAVisit
		for rows.Next() {
			var v RCAVisit
			var cat, cot sql.NullString
			var clat, clng, colat, colng, custLat, custLng sql.NullFloat64
			var dur sql.NullInt64
			if err := rows.Scan(
				&v.ID, &v.CompanyID, &v.RepresentativeID, &v.CustomerID,
				&v.CustomerName, &v.CustomerCity, &v.CustomerNeighborhood,
				&v.CustomerAddress, &v.CustomerAddressNumber, &custLat, &custLng,
				&v.VisitDate, &v.Status,
				&cat, &clat, &clng,
				&cot, &colat, &colng,
				&dur, &v.Notes, &v.CreatedAt,
			); err != nil {
				continue
			}
			if cat.Valid {
				v.CheckinAt = &cat.String
			}
			if clat.Valid {
				v.CheckinLat = &clat.Float64
			}
			if clng.Valid {
				v.CheckinLng = &clng.Float64
			}
			if cot.Valid {
				v.CheckoutAt = &cot.String
			}
			if colat.Valid {
				v.CheckoutLat = &colat.Float64
			}
			if colng.Valid {
				v.CheckoutLng = &colng.Float64
			}
			if dur.Valid {
				d := int(dur.Int64)
				v.DurationMinutes = &d
			}
			if custLat.Valid {
				v.CustomerLat = &custLat.Float64
			}
			if custLng.Valid {
				v.CustomerLng = &custLng.Float64
			}
			visits = append(visits, v)
		}
		if visits == nil {
			visits = []RCAVisit{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"visits": visits, "total": len(visits)})
	}
}

// -----------------------------------------------------------------------
// Mobile (RCA role) Handlers
// -----------------------------------------------------------------------

// GetMyRouteHandler handles GET /api/rca/my-route
func GetMyRouteHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		userID := GetUserIDFromContext(r)
		if companyID == "" || userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Find representative record
		var repID int
		err := db.QueryRow(
			`SELECT id FROM rca_representatives WHERE user_id = $1 AND company_id = $2 AND is_active = TRUE`,
			userID, companyID,
		).Scan(&repID)
		if err == sql.ErrNoRows {
			http.Error(w, "Representative profile not found. Contact your administrator.", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}

		// Find active routes for this rep
		routeRows, err := db.Query(`
			SELECT id, name, COALESCE(description,'')
			FROM rca_routes
			WHERE representative_id = $1 AND company_id = $2 AND is_active = TRUE
			ORDER BY name ASC
		`, repID, companyID)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer routeRows.Close()

		type RouteWithCustomers struct {
			ID          int           `json:"id"`
			Name        string        `json:"name"`
			Description string        `json:"description"`
			Customers   []RCACustomer `json:"customers"`
		}

		var routes []RouteWithCustomers
		for routeRows.Next() {
			var rt RouteWithCustomers
			if err := routeRows.Scan(&rt.ID, &rt.Name, &rt.Description); err != nil {
				continue
			}

			// Load customers with today's visit status
			custRows, err := db.Query(`
				SELECT c.id, c.company_id, c.route_id, c.company_name, COALESCE(c.contact_name,''),
					COALESCE(c.phone,''), COALESCE(c.city,''), COALESCE(c.neighborhood,''),
					COALESCE(c.address,''), COALESCE(c.address_number,''),
					c.lat, c.lng, c.priority, COALESCE(c.notes,''), c.is_active, c.created_at::text,
					v.id AS today_visit_id, v.status AS today_visit_status
				FROM rca_customers c
				LEFT JOIN rca_visits v ON v.customer_id = c.id
					AND v.representative_id = $1
					AND v.visit_date = CURRENT_DATE
				WHERE c.route_id = $2 AND c.company_id = $3 AND c.is_active = TRUE
				ORDER BY c.priority ASC
			`, repID, rt.ID, companyID)
			if err != nil {
				continue
			}

			for custRows.Next() {
				var c RCACustomer
				var lat, lng sql.NullFloat64
				var todayVID sql.NullInt64
				var todayVStatus sql.NullString
				if err := custRows.Scan(
					&c.ID, &c.CompanyID, &c.RouteID, &c.CompanyName,
					&c.ContactName, &c.Phone, &c.City, &c.Neighborhood,
					&c.Address, &c.AddressNumber, &lat, &lng,
					&c.Priority, &c.Notes, &c.IsActive, &c.CreatedAt,
					&todayVID, &todayVStatus,
				); err != nil {
					continue
				}
				if lat.Valid {
					c.Lat = &lat.Float64
				}
				if lng.Valid {
					c.Lng = &lng.Float64
				}
				if todayVID.Valid {
					id := int(todayVID.Int64)
					c.TodayVisitID = &id
				}
				if todayVStatus.Valid {
					c.TodayVisitStatus = &todayVStatus.String
				}
				rt.Customers = append(rt.Customers, c)
			}
			custRows.Close()

			if rt.Customers == nil {
				rt.Customers = []RCACustomer{}
			}
			routes = append(routes, rt)
		}

		if routes == nil {
			routes = []RouteWithCustomers{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"representative_id": repID,
			"routes":            routes,
		})
	}
}

// RCACheckinHandler handles POST /api/rca/visits/checkin
func RCACheckinHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		userID := GetUserIDFromContext(r)
		if companyID == "" || userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var req CheckinRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if req.CustomerID == 0 {
			http.Error(w, "customer_id is required", http.StatusBadRequest)
			return
		}

		repID, err := getRepresentativeID(db, userID, companyID)
		if err != nil {
			http.Error(w, "Representative profile not found", http.StatusNotFound)
			return
		}

		var visitID int
		err = db.QueryRow(`
			INSERT INTO rca_visits (company_id, representative_id, customer_id, visit_date,
				status, checkin_at, checkin_lat, checkin_lng)
			VALUES ($1, $2, $3, CURRENT_DATE, 'em_visita', NOW(), $4, $5)
			ON CONFLICT (representative_id, customer_id, visit_date)
			DO UPDATE SET
				status = 'em_visita',
				checkin_at = EXCLUDED.checkin_at,
				checkin_lat = EXCLUDED.checkin_lat,
				checkin_lng = EXCLUDED.checkin_lng,
				updated_at = NOW()
			RETURNING id
		`, companyID, repID, req.CustomerID, req.Lat, req.Lng).Scan(&visitID)
		if err != nil {
			http.Error(w, "Error registering check-in: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"visit_id": visitID,
			"message":  "Check-in registrado com sucesso",
		})
	}
}

// RCACheckoutHandler handles POST /api/rca/visits/checkout
func RCACheckoutHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		userID := GetUserIDFromContext(r)
		if companyID == "" || userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var req CheckoutRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}
		if req.VisitID == 0 {
			http.Error(w, "visit_id is required", http.StatusBadRequest)
			return
		}

		repID, err := getRepresentativeID(db, userID, companyID)
		if err != nil {
			http.Error(w, "Representative profile not found", http.StatusNotFound)
			return
		}

		var visitID, duration int
		err = db.QueryRow(`
			UPDATE rca_visits SET
				status = 'concluida',
				checkout_at = NOW(),
				checkout_lat = $3,
				checkout_lng = $4,
				duration_minutes = EXTRACT(EPOCH FROM (NOW() - checkin_at)) / 60,
				notes = $5,
				updated_at = NOW()
			WHERE id = $1 AND representative_id = $2 AND status = 'em_visita'
			RETURNING id, COALESCE(duration_minutes, 0)
		`, req.VisitID, repID, req.Lat, req.Lng, req.Notes).Scan(&visitID, &duration)
		if err == sql.ErrNoRows {
			http.Error(w, "Visit not found or already concluded", http.StatusBadRequest)
			return
		}
		if err != nil {
			http.Error(w, "Error registering check-out: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"visit_id":         visitID,
			"duration_minutes": duration,
			"message":          "Check-out registrado com sucesso",
		})
	}
}

// GetTodayVisitsHandler handles GET /api/rca/visits/today
func GetTodayVisitsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		companyID := GetCompanyIDFromContext(r)
		userID := GetUserIDFromContext(r)
		if companyID == "" || userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		repID, err := getRepresentativeID(db, userID, companyID)
		if err != nil {
			http.Error(w, "Representative profile not found", http.StatusNotFound)
			return
		}

		rows, err := db.Query(`
			SELECT v.id, v.company_id, v.representative_id, v.customer_id,
				COALESCE(c.company_name,''), COALESCE(c.city,''), COALESCE(c.neighborhood,''),
				COALESCE(c.address,''), COALESCE(c.address_number,''), c.lat, c.lng,
				v.visit_date::text, v.status,
				v.checkin_at::text, v.checkin_lat, v.checkin_lng,
				v.checkout_at::text, v.checkout_lat, v.checkout_lng,
				v.duration_minutes, COALESCE(v.notes,''), v.created_at::text
			FROM rca_visits v
			JOIN rca_customers c ON c.id = v.customer_id
			WHERE v.representative_id = $1 AND v.visit_date = CURRENT_DATE
			ORDER BY v.checkin_at ASC NULLS LAST
		`, repID)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var visits []RCAVisit
		for rows.Next() {
			var v RCAVisit
			var cat, cot sql.NullString
			var clat, clng, colat, colng, custLat, custLng sql.NullFloat64
			var dur sql.NullInt64
			if err := rows.Scan(
				&v.ID, &v.CompanyID, &v.RepresentativeID, &v.CustomerID,
				&v.CustomerName, &v.CustomerCity, &v.CustomerNeighborhood,
				&v.CustomerAddress, &v.CustomerAddressNumber, &custLat, &custLng,
				&v.VisitDate, &v.Status,
				&cat, &clat, &clng,
				&cot, &colat, &colng,
				&dur, &v.Notes, &v.CreatedAt,
			); err != nil {
				continue
			}
			if cat.Valid {
				v.CheckinAt = &cat.String
			}
			if clat.Valid {
				v.CheckinLat = &clat.Float64
			}
			if clng.Valid {
				v.CheckinLng = &clng.Float64
			}
			if cot.Valid {
				v.CheckoutAt = &cot.String
			}
			if colat.Valid {
				v.CheckoutLat = &colat.Float64
			}
			if colng.Valid {
				v.CheckoutLng = &colng.Float64
			}
			if dur.Valid {
				d := int(dur.Int64)
				v.DurationMinutes = &d
			}
			if custLat.Valid {
				v.CustomerLat = &custLat.Float64
			}
			if custLng.Valid {
				v.CustomerLng = &custLng.Float64
			}
			visits = append(visits, v)
		}
		if visits == nil {
			visits = []RCAVisit{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"visits": visits, "total": len(visits)})
	}
}

