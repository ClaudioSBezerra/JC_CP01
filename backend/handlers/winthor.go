package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

// --- Winthor Integration Types ---

type WinthorStockItem struct {
	FilialCode      string  `json:"filial_code"`
	LocationCode    string  `json:"location_code"`
	ProductCode     string  `json:"product_code"`
	ProductDesc     string  `json:"product_desc"`
	CurrentQty      float64 `json:"current_qty"`
	MinQty          float64 `json:"min_qty"`
	MaxQty          float64 `json:"max_qty"`
	ABCClass        string  `json:"abc_class"`
}

type WinthorWavePayload struct {
	WaveNumber string             `json:"wave_number"`
	Filial     string             `json:"filial"`
	Tasks      []WinthorTaskItem  `json:"tasks"`
	GeneratedAt string            `json:"generated_at"`
}

type WinthorTaskItem struct {
	LocationCode    string  `json:"location_code"`
	ProductCode     string  `json:"product_code"`
	ProductDesc     string  `json:"product_desc"`
	QtyToReplenish  float64 `json:"qty_to_replenish"`
	ABCClass        string  `json:"abc_class"`
	Priority        int     `json:"priority"`
}

type WinthorWaveResponse struct {
	Success    bool   `json:"success"`
	WinthorRef string `json:"winthor_ref"`
	Message    string `json:"message"`
}

// --- Interface ---

type WinthorClient interface {
	GetPickingStock(companyID, filial string) ([]WinthorStockItem, error)
	SendReplenishmentWave(companyID string, wave WinthorWavePayload) (WinthorWaveResponse, error)
}

// --- Mock Client ---

type MockWinthorClient struct {
	DB *sql.DB
}

func (m *MockWinthorClient) GetPickingStock(companyID, filial string) ([]WinthorStockItem, error) {
	// Read current picking_stock from DB and apply simulated depletion
	rows, err := m.DB.Query(`
		SELECT ps.product_code, ps.product_description, ps.current_qty,
		       ps.min_qty, ps.max_qty, ps.abc_class, pl.location_code
		FROM picking_stock ps
		JOIN picking_locations pl ON pl.id = ps.location_id
		WHERE ps.company_id = $1 AND ps.filial = $2
	`, companyID, filial)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []WinthorStockItem
	for rows.Next() {
		var item WinthorStockItem
		var currentQty, minQty, maxQty float64
		if err := rows.Scan(&item.ProductCode, &item.ProductDesc, &currentQty,
			&minQty, &maxQty, &item.ABCClass, &item.LocationCode); err != nil {
			continue
		}
		item.FilialCode = filial
		item.MinQty = minQty
		item.MaxQty = maxQty

		// Simulate depletion: ABC A depletes faster
		depletionPct := rand.Float64()
		switch item.ABCClass {
		case "A":
			depletionPct = 0.10 + rand.Float64()*0.15 // 10-25%
		case "B":
			depletionPct = 0.05 + rand.Float64()*0.10 // 5-15%
		default:
			depletionPct = 0.02 + rand.Float64()*0.06 // 2-8%
		}

		depleted := currentQty - (maxQty * depletionPct)
		if depleted < 0 {
			depleted = 0
		}
		item.CurrentQty = depleted
		items = append(items, item)
	}

	// Small artificial delay to simulate API call
	time.Sleep(time.Duration(50+rand.Intn(150)) * time.Millisecond)

	return items, nil
}

func (m *MockWinthorClient) SendReplenishmentWave(companyID string, wave WinthorWavePayload) (WinthorWaveResponse, error) {
	// Simulate API latency
	time.Sleep(time.Duration(100+rand.Intn(300)) * time.Millisecond)

	// 5% random error rate to test resilience
	if rand.Float64() < 0.05 {
		return WinthorWaveResponse{}, fmt.Errorf("mock winthor timeout: connection refused")
	}

	ref := fmt.Sprintf("WTH-%s-%s-%d", time.Now().Format("20060102150405"), wave.Filial, rand.Intn(9999))
	return WinthorWaveResponse{
		Success:    true,
		WinthorRef: ref,
		Message:    fmt.Sprintf("Onda %s aceita pelo Winthor (mock). %d tarefas geradas.", wave.WaveNumber, len(wave.Tasks)),
	}, nil
}

// --- Real HTTP Client ---

type RealWinthorClient struct {
	BaseURL string
	APIKey  string
	Client  *http.Client
}

func NewRealWinthorClient(baseURL, apiKey string) *RealWinthorClient {
	return &RealWinthorClient{
		BaseURL: strings.TrimRight(baseURL, "/"),
		APIKey:  apiKey,
		Client:  &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *RealWinthorClient) GetPickingStock(companyID, filial string) ([]WinthorStockItem, error) {
	url := fmt.Sprintf("%s/picking-stock?filial=%s", c.BaseURL, filial)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("X-Company-ID", companyID)

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("winthor API returned status %d", resp.StatusCode)
	}

	var items []WinthorStockItem
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return nil, err
	}
	return items, nil
}

func (c *RealWinthorClient) SendReplenishmentWave(companyID string, wave WinthorWavePayload) (WinthorWaveResponse, error) {
	url := fmt.Sprintf("%s/replenishment", c.BaseURL)
	body, err := json.Marshal(wave)
	if err != nil {
		return WinthorWaveResponse{}, err
	}

	req, err := http.NewRequest("POST", url, strings.NewReader(string(body)))
	if err != nil {
		return WinthorWaveResponse{}, err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Company-ID", companyID)

	resp, err := c.Client.Do(req)
	if err != nil {
		return WinthorWaveResponse{}, err
	}
	defer resp.Body.Close()

	var result WinthorWaveResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return WinthorWaveResponse{}, err
	}
	return result, nil
}

// --- Factory ---

type PickingSettings struct {
	UseMock    bool
	APIURL     string
	APIKey     string
}

func NewWinthorClient(db *sql.DB, settings PickingSettings) WinthorClient {
	if settings.UseMock || settings.APIURL == "" {
		return &MockWinthorClient{DB: db}
	}
	return NewRealWinthorClient(settings.APIURL, settings.APIKey)
}
