package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"aprovapedido/services"

	"github.com/golang-jwt/jwt/v5"
)

var reCompanyPlaceholder = regexp.MustCompile(`'?__COMPANY(?:_ID(?:__)?)?'?`)

type aiQueryRequest struct {
	Pergunta string `json:"pergunta"`
}

type aiQueryResult struct {
	Pergunta string                   `json:"pergunta"`
	SQL      string                   `json:"sql"`
	Columns  []string                 `json:"columns"`
	Rows     []map[string]interface{} `json:"rows"`
	RowCount int                      `json:"row_count"`
	Model    string                   `json:"model"`
}

func jsonErr(w http.ResponseWriter, status int, msg string, extra ...map[string]string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	out := map[string]string{"error": msg}
	for _, m := range extra {
		for k, v := range m {
			out[k] = v
		}
	}
	json.NewEncoder(w).Encode(out)
}

func AIQueryHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		if r.Method != http.MethodPost {
			jsonErr(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		claims, ok := r.Context().Value(ClaimsKey).(jwt.MapClaims)
		if !ok {
			jsonErr(w, http.StatusUnauthorized, "unauthorized")
			return
		}

		companyID, _ := claims["company_id"].(string)
		if companyID == "" {
			jsonErr(w, http.StatusBadRequest, "company_id not found")
			return
		}

		var req aiQueryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Pergunta) == "" {
			jsonErr(w, http.StatusBadRequest, "pergunta invalida ou ausente")
			return
		}

		aiClient := services.NewAIClient()
		if !aiClient.IsAvailable() {
			jsonErr(w, http.StatusServiceUnavailable, "IA nao configurada (ZAI_API_KEY ausente)")
			return
		}

		userPrompt := services.BuildTextToSQLPrompt(req.Pergunta)
		aiResp, err := aiClient.GenerateFastRaw(services.SystemPromptTextToSQL, userPrompt, "", 2048)
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, fmt.Sprintf("Erro na IA: %v", err))
			return
		}

		generatedSQL, err := services.ExtractSQL(aiResp.Text)
		if err != nil {
			fmt.Printf("[AI Query] ExtractSQL failed: %v\nRaw AI text (first 500): %.500s\n", err, aiResp.Text)
			jsonErr(w, http.StatusUnprocessableEntity,
				fmt.Sprintf("IA nao retornou SQL valido: %v", err),
				map[string]string{"ai_text": aiResp.Text},
			)
			return
		}

		finalSQL := reCompanyPlaceholder.ReplaceAllString(generatedSQL, "'"+companyID+"'")

		if strings.Contains(finalSQL, "__COMPANY") {
			jsonErr(w, http.StatusUnprocessableEntity,
				"SQL gerado contem placeholder nao resolvido",
				map[string]string{"sql": finalSQL},
			)
			return
		}

		if !strings.Contains(strings.ToUpper(finalSQL), "LIMIT") {
			finalSQL += "\nLIMIT 100"
		}

		rows, err := db.Query(finalSQL)
		if err != nil {
			jsonErr(w, http.StatusBadRequest,
				fmt.Sprintf("Erro ao executar query: %v", err),
				map[string]string{"sql": finalSQL},
			)
			return
		}
		defer rows.Close()

		cols, _ := rows.Columns()
		var resultRows []map[string]interface{}
		for rows.Next() {
			vals := make([]interface{}, len(cols))
			ptrs := make([]interface{}, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				continue
			}
			row := make(map[string]interface{})
			for i, col := range cols {
				if b, ok := vals[i].([]byte); ok {
					row[col] = string(b)
				} else {
					row[col] = vals[i]
				}
			}
			resultRows = append(resultRows, row)
		}

		if resultRows == nil {
			resultRows = []map[string]interface{}{}
		}

		json.NewEncoder(w).Encode(aiQueryResult{
			Pergunta: req.Pergunta,
			SQL:      finalSQL,
			Columns:  cols,
			Rows:     resultRows,
			RowCount: len(resultRows),
			Model:    aiResp.Model,
		})
	}
}
