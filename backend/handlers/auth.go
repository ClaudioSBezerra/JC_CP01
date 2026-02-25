package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// --- Structs ---

type contextKey string

const ClaimsKey contextKey = "claims"

type User struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	FullName  string `json:"full_name"`
	Role      string `json:"role"`
	CompanyID string `json:"company_id"`
	CreatedAt string `json:"created_at"`
}

type RegisterRequest struct {
	FullName    string `json:"full_name"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	Role        string `json:"role"`
	CompanyName string `json:"company_name"`
	CNPJ        string `json:"cnpj"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token     string `json:"token"`
	User      User   `json:"user"`
	Company   string `json:"company_name"`
	CompanyID string `json:"company_id"`
}

// --- Utils ---

var jwtSecret = []byte(getEnv("JWT_SECRET", "aprovapedido-dev-secret"))

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

func GenerateToken(userID, role, companyID string) (string, error) {
	claims := jwt.MapClaims{
		"user_id":    userID,
		"role":       role,
		"company_id": companyID,
		"exp":        time.Now().Add(time.Hour * 24).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// --- Middleware ---

func AuthMiddleware(next http.HandlerFunc, requiredRole string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Company-ID")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}

		tokenString := ""
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			tokenString = authHeader[7:]
		} else {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || !token.Valid {
			http.Error(w, "Invalid token claims", http.StatusUnauthorized)
			return
		}

		userRole, _ := claims["role"].(string)
		if requiredRole != "" && userRole != requiredRole && userRole != "admin" {
			http.Error(w, "Forbidden: insufficient permissions", http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		next(w, r.WithContext(ctx))
	}
}

func GetUserIDFromContext(r *http.Request) string {
	claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
	if !ok {
		return ""
	}
	userID, _ := claims["user_id"].(string)
	return userID
}

func GetCompanyIDFromContext(r *http.Request) string {
	claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
	if !ok {
		return ""
	}
	companyID, _ := claims["company_id"].(string)
	return companyID
}

func GetUserRoleFromContext(r *http.Request) string {
	claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
	if !ok {
		return ""
	}
	role, _ := claims["role"].(string)
	return role
}

// --- Handlers ---

func GetMeHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := GetUserIDFromContext(r)
		if userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		var user User
		err := db.QueryRow(`
			SELECT id, email, full_name, role, COALESCE(company_id, 0), created_at
			FROM users WHERE id = $1
		`, userID).Scan(&user.ID, &user.Email, &user.FullName, &user.Role, &user.CompanyID, &user.CreatedAt)

		if err != nil {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}

func RegisterHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		var req RegisterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Email == "" || req.Password == "" || req.FullName == "" || req.CompanyName == "" {
			http.Error(w, "Missing required fields: email, password, full_name, company_name", http.StatusBadRequest)
			return
		}

		if len(req.Password) < 6 {
			http.Error(w, "Password must be at least 6 characters", http.StatusBadRequest)
			return
		}

		hash, err := HashPassword(req.Password)
		if err != nil {
			log.Printf("[Register] Error hashing password: %v", err)
			http.Error(w, "Error processing password", http.StatusInternalServerError)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			log.Printf("[Register] Error starting transaction: %v", err)
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback()

		// Create company
		var companyID string
		err = tx.QueryRow(`
			INSERT INTO companies (cnpj, name, trade_name)
			VALUES ($1, $2, $2)
			ON CONFLICT (cnpj) DO UPDATE SET name = EXCLUDED.name
			RETURNING id
		`, req.CNPJ, req.CompanyName).Scan(&companyID)
		if err != nil {
			log.Printf("[Register] Error creating company: %v", err)
			http.Error(w, "Error creating company", http.StatusInternalServerError)
			return
		}

		// Create user
		role := req.Role
		if role == "" {
			role = "comprador"
		}

		var userID string
		err = tx.QueryRow(`
			INSERT INTO users (email, password_hash, full_name, role, company_id)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id
		`, req.Email, hash, req.FullName, role, companyID).Scan(&userID)

		if err != nil {
			log.Printf("[Register] Error creating user: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]string{"error": "Este e-mail já está cadastrado."})
			return
		}

		// Create default settings for company
		_, _ = tx.Exec(`
			INSERT INTO settings (company_id, low_turnover_days, warning_turnover_days)
			VALUES ($1, 90, 60)
			ON CONFLICT (company_id) DO NOTHING
		`, companyID)

		if err := tx.Commit(); err != nil {
			log.Printf("[Register] Error committing: %v", err)
			http.Error(w, "Transaction commit failed", http.StatusInternalServerError)
			return
		}

		token, _ := GenerateToken(userID, role, companyID)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(AuthResponse{
			Token: token,
			User: User{
				ID:        userID,
				Email:     req.Email,
				FullName:  req.FullName,
				Role:      role,
				CompanyID: companyID,
			},
			Company:   req.CompanyName,
			CompanyID: companyID,
		})
	}
}

func LoginHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		log.Printf("[Login] Attempting login for: %s", req.Email)

		var user User
		var hash string
		err := db.QueryRow(`
			SELECT u.id, u.email, u.full_name, u.password_hash, u.role, COALESCE(u.company_id, 0), u.created_at
			FROM users u WHERE u.email = $1
		`, req.Email).Scan(&user.ID, &user.Email, &user.FullName, &hash, &user.Role, &user.CompanyID, &user.CreatedAt)

		if err == sql.ErrNoRows {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "E-mail ou senha inválidos"})
			return
		} else if err != nil {
			log.Printf("[Login] Database error: %v", err)
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}

		if !CheckPasswordHash(req.Password, hash) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"error": "E-mail ou senha inválidos"})
			return
		}

		token, err := GenerateToken(user.ID, user.Role, user.CompanyID)
		if err != nil {
			http.Error(w, "Error generating token", http.StatusInternalServerError)
			return
		}

		// Get company name
		var companyName string
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		_ = db.QueryRowContext(ctx, "SELECT name FROM companies WHERE id = $1", user.CompanyID).Scan(&companyName)

		log.Printf("[Login] Success for %s (role: %s, company: %s)", req.Email, user.Role, companyName)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(AuthResponse{
			Token:     token,
			User:      user,
			Company:   companyName,
			CompanyID: fmt.Sprintf("%s", user.CompanyID),
		})
	}
}
