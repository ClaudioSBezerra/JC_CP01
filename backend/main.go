package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"aprovapedido/handlers"
	"aprovapedido/scheduler"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const (
	BackendVersion = "2.0.0"
	FeatureSet     = "JCInteligenc: Modulo Compras (Aprovacao de Pedidos, Importacao CSV, Dashboard de Giro) + Modulo Logistica (LogiPick, Reabastecimento Automatico, Ondas Winthor)"
)

var pickingScheduler *scheduler.PickingScheduler

type HealthResponse struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
	Service   string `json:"service"`
	Version   string `json:"version"`
	Features  string `json:"features"`
	Database  string `json:"database"`
}

var (
	db      *sql.DB
	dbMutex sync.RWMutex
	dbErr   error
)

func getDB() *sql.DB {
	dbMutex.RLock()
	defer dbMutex.RUnlock()
	return db
}

func initDBAsync() {
	go func() {
		var conn *sql.DB
		var err error
		connStr := os.Getenv("DATABASE_URL")
		if connStr == "" {
			connStr = "postgres://postgres:postgres@localhost:5432/aprovapedido_db?sslmode=disable"
			fmt.Println("DATABASE_URL not set, using default local connection")
		}

		attempt := 0
		for {
			attempt++
			conn, err = sql.Open("postgres", connStr)
			if err == nil {
				err = conn.Ping()
				if err == nil {
					conn.SetMaxOpenConns(25)
					conn.SetMaxIdleConns(10)
					conn.SetConnMaxLifetime(30 * time.Minute)

					dbMutex.Lock()
					db = conn
					dbErr = nil
					dbMutex.Unlock()

					fmt.Println("Successfully connected to the database!")
					onDBConnected()
					return
				}
			}

			dbMutex.Lock()
			dbErr = fmt.Errorf("attempt %d: %v", attempt, err)
			dbMutex.Unlock()

			fmt.Printf("Failed to connect to database (attempt %d): %v. Retrying in 5s...\n", attempt, err)
			time.Sleep(5 * time.Second)
		}
	}()
}

func onDBConnected() {
	database := getDB()
	// Start picking scheduler
	pickingScheduler = scheduler.New(database)
	go pickingScheduler.Start(context.Background())

	// Execute migrations
	migrationDir := "migrations"
	if _, err := os.Stat(migrationDir); os.IsNotExist(err) {
		if _, err := os.Stat("backend/migrations"); err == nil {
			migrationDir = "backend/migrations"
		}
	}

	fmt.Printf("Looking for migrations in: %s\n", migrationDir)
	files, err := filepath.Glob(filepath.Join(migrationDir, "*.sql"))
	if err != nil {
		log.Printf("Error finding migration files: %v", err)
		return
	}

	// Ensure schema_migrations table exists
	_, _ = database.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		filename VARCHAR(255) PRIMARY KEY,
		executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
	)`)

	for _, file := range files {
		baseName := filepath.Base(file)
		var alreadyExecuted bool
		database.QueryRow("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE filename=$1)", baseName).Scan(&alreadyExecuted)
		if alreadyExecuted {
			continue
		}

		fmt.Printf("Executing migration: %s\n", file)
		migration, err := os.ReadFile(file)
		if err != nil {
			log.Printf("Could not read migration file %s: %v", file, err)
			continue
		}
		_, err = database.Exec(string(migration))
		if err != nil {
			log.Printf("Migration %s warning: %v", file, err)
			if strings.Contains(err.Error(), "already exists") || strings.Contains(err.Error(), "duplicate") {
				database.Exec("INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING", baseName)
			}
		} else {
			fmt.Printf("Migration %s executed successfully.\n", file)
		}
		database.Exec("INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING", baseName)
	}
}

func main() {
	_ = godotenv.Load()

	fmt.Println("==================================================")
	fmt.Printf("   AprovaPedido Backend - v%s\n", BackendVersion)
	fmt.Println("==================================================")

	initDBAsync()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	// Helper to wrap DB dependency
	withDB := func(handlerFactory func(*sql.DB) http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			database := getDB()
			if database == nil {
				http.Error(w, "Database initializing, please wait...", http.StatusServiceUnavailable)
				return
			}
			handlerFactory(database)(w, r)
		}
	}

	withAuth := func(handlerFactory func(*sql.DB) http.HandlerFunc, role string) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			database := getDB()
			if database == nil {
				http.Error(w, "Database initializing...", http.StatusServiceUnavailable)
				return
			}
			h := handlerFactory(database)
			handlers.AuthMiddleware(h, role)(w, r)
		}
	}

	// Global CORS for OPTIONS preflight
	corsMiddleware := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next(w, r)
		}
	}

	// Health
	http.HandleFunc("/api/health", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		dbStatus := "connecting..."
		database := getDB()
		if database != nil {
			if err := database.Ping(); err != nil {
				dbStatus = "error: " + err.Error()
			} else {
				dbStatus = "connected"
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(HealthResponse{
			Status:    "running",
			Timestamp: time.Now().Format(time.RFC3339),
			Service:   "AprovaPedido Engine",
			Version:   BackendVersion,
			Features:  FeatureSet,
			Database:  dbStatus,
		})
	}))

	// Auth Routes
	http.HandleFunc("/api/auth/register", corsMiddleware(withDB(handlers.RegisterHandler)))
	http.HandleFunc("/api/auth/login", corsMiddleware(withDB(handlers.LoginHandler)))
	http.HandleFunc("/api/auth/me", corsMiddleware(withAuth(handlers.GetMeHandler, "")))

	// Products
	http.HandleFunc("/api/products/import", corsMiddleware(withAuth(handlers.ImportProductsHandler, "")))
	http.HandleFunc("/api/products/clear", corsMiddleware(withAuth(handlers.ClearProductsHandler, "")))
	http.HandleFunc("/api/products/low-turnover", corsMiddleware(withAuth(handlers.LowTurnoverProductsHandler, "")))
	http.HandleFunc("/api/products", corsMiddleware(withAuth(handlers.ListProductsHandler, "")))

	// Purchase Orders
	http.HandleFunc("/api/orders/import", corsMiddleware(withAuth(handlers.ImportOrdersHandler, "")))
	http.HandleFunc("/api/orders", corsMiddleware(withAuth(handlers.ListOrdersHandler, "")))

	// Order detail and approval routes
	http.HandleFunc("/api/orders/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		database := getDB()
		if database == nil {
			http.Error(w, "Database initializing...", http.StatusServiceUnavailable)
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/api/orders/")

		// Route matching
		if strings.HasSuffix(path, "/approve") {
			if strings.Contains(path, "/items/") {
				handlers.AuthMiddleware(handlers.ApproveItemHandler(database), "aprovador")(w, r)
			} else {
				handlers.AuthMiddleware(handlers.ApproveOrderHandler(database), "aprovador")(w, r)
			}
			return
		}
		if strings.HasSuffix(path, "/reject") {
			if strings.Contains(path, "/items/") {
				handlers.AuthMiddleware(handlers.RejectItemHandler(database), "aprovador")(w, r)
			} else {
				handlers.AuthMiddleware(handlers.RejectOrderHandler(database), "aprovador")(w, r)
			}
			return
		}

		// Default: order detail
		handlers.AuthMiddleware(handlers.GetOrderDetailHandler(database), "")(w, r)
	}))

	// Dashboard
	http.HandleFunc("/api/dashboard/summary", corsMiddleware(withAuth(handlers.DashboardSummaryHandler, "")))
	http.HandleFunc("/api/dashboard/charts", corsMiddleware(withAuth(handlers.DashboardChartsHandler, "")))

	// Settings
	http.HandleFunc("/api/settings", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		database := getDB()
		if database == nil {
			http.Error(w, "Database initializing...", http.StatusServiceUnavailable)
			return
		}
		switch r.Method {
		case http.MethodGet:
			handlers.AuthMiddleware(handlers.GetSettingsHandler(database), "")(w, r)
		case http.MethodPut:
			handlers.AuthMiddleware(handlers.UpdateSettingsHandler(database), "")(w, r)
		default:
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Approval History
	http.HandleFunc("/api/approvals/history", corsMiddleware(withAuth(handlers.ListApprovalHistoryHandler, "")))

	// AI Query (Consulta Inteligente)
	http.HandleFunc("/api/ai/query", corsMiddleware(withAuth(handlers.AIQueryHandler, "")))

	// Clear All (Limpeza Geral)
	http.HandleFunc("/api/clear-all", corsMiddleware(withAuth(handlers.ClearAllHandler, "")))

	// Picking Module — specific routes BEFORE the wildcard /api/picking/
	http.HandleFunc("/api/picking/dashboard", corsMiddleware(withAuth(handlers.GetPickingDashboardHandler, "")))
	http.HandleFunc("/api/picking/fragmentation", corsMiddleware(withAuth(handlers.GetFragmentationHandler, "")))
	http.HandleFunc("/api/picking/import", corsMiddleware(withAuth(handlers.ImportPickingCSVHandler, "")))
	http.HandleFunc("/api/picking/sync", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		database := getDB()
		if database == nil {
			http.Error(w, "Database initializing...", http.StatusServiceUnavailable)
			return
		}
		h := handlers.SyncNowHandler(database, func(companyID string) {
			if pickingScheduler != nil {
				pickingScheduler.RunNow(companyID)
			}
		})
		handlers.AuthMiddleware(h, "")(w, r)
	}))
	http.HandleFunc("/api/picking/sync-log", corsMiddleware(withAuth(handlers.GetSyncLogHandler, "")))
	http.HandleFunc("/api/picking/locations", corsMiddleware(withAuth(handlers.ListPickingLocationsHandler, "")))
	http.HandleFunc("/api/picking/locations/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		database := getDB()
		if database == nil {
			http.Error(w, "Database initializing...", http.StatusServiceUnavailable)
			return
		}
		if r.Method == http.MethodDelete {
			handlers.AuthMiddleware(handlers.DeletePickingLocationHandler(database), "")(w, r)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	// Waves — specific routes BEFORE /api/waves/
	http.HandleFunc("/api/waves/stats", corsMiddleware(withAuth(handlers.GetWaveStatsHandler, "")))
	http.HandleFunc("/api/waves/generate", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		database := getDB()
		if database == nil {
			http.Error(w, "Database initializing...", http.StatusServiceUnavailable)
			return
		}
		h := handlers.GenerateWaveHandler(database, func(companyID, filial string) error {
			return scheduler.GenerateWaveManual(database, companyID, filial)
		})
		handlers.AuthMiddleware(h, "")(w, r)
	}))
	http.HandleFunc("/api/waves", corsMiddleware(withAuth(handlers.ListWavesHandler, "")))
	http.HandleFunc("/api/waves/", corsMiddleware(withAuth(handlers.GetWaveDetailHandler, "")))

	// Company users list
	http.HandleFunc("/api/users", corsMiddleware(withAuth(handlers.ListUsersHandler, "")))

	// RCA Module — specific routes BEFORE wildcards
	http.HandleFunc("/api/rca/representatives", corsMiddleware(withAuth(handlers.ListOrCreateRCARepresentativesHandler, "")))
	http.HandleFunc("/api/rca/routes", corsMiddleware(withAuth(handlers.ListOrCreateRCARoutesHandler, "")))
	http.HandleFunc("/api/rca/dashboard", corsMiddleware(withAuth(handlers.GetRCADashboardHandler, "")))
	http.HandleFunc("/api/rca/my-route", corsMiddleware(withAuth(handlers.GetMyRouteHandler, "rca")))
	http.HandleFunc("/api/rca/visits/checkin", corsMiddleware(withAuth(handlers.RCACheckinHandler, "rca")))
	http.HandleFunc("/api/rca/visits/checkout", corsMiddleware(withAuth(handlers.RCACheckoutHandler, "rca")))
	http.HandleFunc("/api/rca/visits/today", corsMiddleware(withAuth(handlers.GetTodayVisitsHandler, "rca")))

	// Wildcard: /api/rca/routes/:id/customers
	http.HandleFunc("/api/rca/routes/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		database := getDB()
		if database == nil {
			http.Error(w, "Database initializing...", http.StatusServiceUnavailable)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/api/rca/routes/")
		parts := strings.Split(path, "/")
		if len(parts) == 2 && parts[1] == "customers" {
			switch r.Method {
			case http.MethodGet:
				handlers.AuthMiddleware(handlers.ListRCARouteCustomersHandler(database), "")(w, r)
			case http.MethodPost:
				handlers.AuthMiddleware(handlers.AddRCACustomerHandler(database), "")(w, r)
			default:
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		http.Error(w, "Not found", http.StatusNotFound)
	}))

	// Wildcard: DELETE /api/rca/customers/:id
	http.HandleFunc("/api/rca/customers/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		database := getDB()
		if database == nil {
			http.Error(w, "Database initializing...", http.StatusServiceUnavailable)
			return
		}
		if r.Method == http.MethodDelete {
			handlers.AuthMiddleware(handlers.DeleteRCACustomerHandler(database), "")(w, r)
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}))

	// Wildcard: GET /api/rca/:id/visits
	http.HandleFunc("/api/rca/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		database := getDB()
		if database == nil {
			http.Error(w, "Database initializing...", http.StatusServiceUnavailable)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, "/api/rca/")
		parts := strings.Split(path, "/")
		if len(parts) == 2 && parts[1] == "visits" && r.Method == http.MethodGet {
			handlers.AuthMiddleware(handlers.GetRCAVisitHistoryHandler(database), "")(w, r)
			return
		}
		http.Error(w, "Not found", http.StatusNotFound)
	}))

	fmt.Printf("AprovaPedido starting on port %s...\n", port)

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      nil,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful Shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)
		sig := <-sigChan
		log.Printf("Received signal %v, shutting down...", sig)

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			log.Printf("HTTP server shutdown error: %v", err)
		}

		database := getDB()
		if database != nil {
			database.Close()
		}

		os.Exit(0)
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
