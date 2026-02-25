package services

import (
	"fmt"
	"regexp"
	"strings"
)

const SystemPromptTextToSQL = `Voce e um especialista em SQL PostgreSQL para um sistema de aprovacao de pedidos de compra de um grande distribuidor.
Sua unica tarefa e gerar uma query SQL para responder a pergunta do usuario.
NAO escreva analise, raciocinio ou explicacao. Va direto ao bloco SQL.

REGRAS OBRIGATORIAS:
1. Responda SOMENTE com o bloco SQL dentro de ` + "```sql\n...\n```" + `. Zero texto fora do bloco.
2. Todas as tabelas tem company_id — filtre diretamente: WHERE company_id = '__COMPANY_ID__'.
3. Use APENAS SELECT. Jamais use INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, TRUNCATE.
4. Inclua LIMIT 100 no final.
5. Use aliases em portugues (ex: AS fornecedor, AS valor_total, AS dias_estoque).
6. stock_days = dias de estoque (cobertura). Quanto MAIOR, PIOR o giro.
7. is_low_turnover = true indica produto com giro baixo (excesso de estoque).
8. Datas estao no formato 'YYYY-MM-DD'.
9. Ordene por valor DESC quando relevante.
10. Para dados de filiais, use stock_filial_01, stock_filial_02, stock_filial_03 (estoque), avg_daily_sales_filial_01/02/03 (venda media) e stock_days_filial_01/02/03 (dias de estoque).
11. seasonality_type pode ser: 'alta', 'media', 'baixa', 'sazonal'. peak_months contem meses de pico separados por virgula (ex: '11,12,01').
12. supplier_lead_time_days = prazo entrega fornecedor. min_stock_days / max_stock_days = estoque minimo/maximo em DDV.
13. status do pedido pode ser: 'pendente', 'aprovado', 'reprovado', 'aprovado_parcial'.
14. item_status do item pode ser: 'pendente', 'aprovado', 'reprovado'.`

const dbSchemaContext = `
-- Schema PostgreSQL do AprovaPedido (multi-empresa)

-- Empresas
CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    cnpj VARCHAR(18) UNIQUE,
    name VARCHAR(255),
    trade_name VARCHAR(255)
);

-- Usuarios (compradores/aprovadores)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    full_name VARCHAR(255),
    role VARCHAR(50),  -- 'comprador', 'aprovador', 'admin'
    company_id INTEGER REFERENCES companies(id)
);

-- Produtos com dados de giro e filiais
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    company_id INTEGER,           -- filtrar aqui
    code VARCHAR(50),             -- codigo interno
    ean VARCHAR(14),
    description VARCHAR(500),
    category VARCHAR(255),        -- 'ALIMENTOS', 'LATICINIOS', 'HIGIENE', 'LIMPEZA', 'BEBIDAS'
    unit VARCHAR(10),
    current_stock NUMERIC(15,3),  -- estoque geral (soma das filiais)
    avg_daily_sales NUMERIC(15,3),-- venda media diaria geral
    stock_days NUMERIC(10,1),     -- dias de estoque geral (current_stock / avg_daily_sales)
    cost_price NUMERIC(15,4),
    last_purchase_date DATE,
    last_sale_date DATE,
    -- Estoque por filial
    stock_filial_01 NUMERIC(15,3),
    stock_filial_02 NUMERIC(15,3),
    stock_filial_03 NUMERIC(15,3),
    -- Venda media por filial
    avg_daily_sales_filial_01 NUMERIC(15,3),
    avg_daily_sales_filial_02 NUMERIC(15,3),
    avg_daily_sales_filial_03 NUMERIC(15,3),
    -- Dias de estoque por filial
    stock_days_filial_01 NUMERIC(10,1),
    stock_days_filial_02 NUMERIC(10,1),
    stock_days_filial_03 NUMERIC(10,1),
    -- Sazonalidade
    seasonality_type VARCHAR(30), -- 'alta', 'media', 'baixa', 'sazonal'
    peak_months VARCHAR(50),      -- meses de pico: '11,12,01'
    -- Fornecedor / Reposicao
    supplier_lead_time_days INTEGER, -- prazo entrega
    min_stock_days INTEGER,          -- estoque minimo em DDV
    max_stock_days INTEGER           -- estoque maximo em DDV
);

-- Pedidos de compra
CREATE TABLE purchase_orders (
    id SERIAL PRIMARY KEY,
    company_id INTEGER,
    order_number VARCHAR(50),      -- numero do pedido
    supplier_name VARCHAR(255),    -- fornecedor
    supplier_cnpj VARCHAR(18),
    buyer_name VARCHAR(255),       -- comprador
    status VARCHAR(30),            -- 'pendente', 'aprovado', 'reprovado', 'aprovado_parcial'
    total_value NUMERIC(15,2),
    total_items INTEGER,
    flagged_items INTEGER,         -- qtd itens com giro baixo
    notes TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
);

-- Itens do pedido
CREATE TABLE purchase_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES purchase_orders(id),
    product_id INTEGER REFERENCES products(id),
    product_code VARCHAR(50),
    product_description VARCHAR(500),
    quantity NUMERIC(15,3),
    unit_price NUMERIC(15,4),
    total_price NUMERIC(15,2),
    stock_days NUMERIC(10,1),      -- dias de estoque na importacao
    current_stock NUMERIC(15,3),
    avg_daily_sales NUMERIC(15,3),
    is_low_turnover BOOLEAN,       -- giro baixo (true/false)
    item_status VARCHAR(30),       -- 'pendente', 'aprovado', 'reprovado'
    rejection_reason TEXT
);

-- Historico de aprovacoes
CREATE TABLE approval_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    item_id INTEGER,
    action VARCHAR(30),            -- 'aprovado', 'reprovado', 'aprovado_parcial'
    user_name VARCHAR(255),
    reason TEXT,
    created_at TIMESTAMPTZ
);

-- Configuracoes por empresa
CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    company_id INTEGER,
    low_turnover_days INTEGER,     -- limite giro baixo (padrao 90)
    warning_turnover_days INTEGER  -- faixa amarela (padrao 60)
);

-- EXEMPLOS:
-- Top 10 produtos com maior excesso de estoque:
--   SELECT code AS codigo, description AS descricao, current_stock AS estoque,
--          avg_daily_sales AS venda_media, stock_days AS dias_estoque, category AS categoria
--   FROM products WHERE company_id = '__COMPANY_ID__'
--   ORDER BY stock_days DESC LIMIT 10
--
-- Valor total em estoque parado (giro baixo):
--   SELECT SUM(current_stock * cost_price) AS valor_estoque_parado
--   FROM products WHERE company_id = '__COMPANY_ID__' AND stock_days >= 90
--
-- Pedidos pendentes com mais itens de giro baixo:
--   SELECT order_number AS pedido, supplier_name AS fornecedor, total_value AS valor_total,
--          total_items, flagged_items AS itens_giro_baixo
--   FROM purchase_orders WHERE company_id = '__COMPANY_ID__' AND status = 'pendente'
--   ORDER BY flagged_items DESC LIMIT 10
--
-- Comparacao de estoque entre filiais:
--   SELECT code AS codigo, description AS descricao,
--          stock_filial_01 AS est_fil01, stock_filial_02 AS est_fil02, stock_filial_03 AS est_fil03,
--          stock_days_filial_01 AS ddv_fil01, stock_days_filial_02 AS ddv_fil02, stock_days_filial_03 AS ddv_fil03
--   FROM products WHERE company_id = '__COMPANY_ID__'
--   ORDER BY stock_days DESC LIMIT 20`

var (
	reSQLBlock  = regexp.MustCompile("(?is)```(?:sql)?\\s*([\\s\\S]+?)```")
	reDangerous = regexp.MustCompile(`(?i)\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b`)
	reSelectPos = regexp.MustCompile(`(?i)\b(SELECT|WITH)\s+`)
)

func BuildTextToSQLPrompt(pergunta string) string {
	return fmt.Sprintf("%s\n\nPergunta: %s", dbSchemaContext, pergunta)
}

func ExtractSQL(aiResponse string) (string, error) {
	if allMatches := reSQLBlock.FindAllStringSubmatch(aiResponse, -1); len(allMatches) > 0 {
		last := allMatches[len(allMatches)-1]
		if len(last) > 1 {
			if sql := cleanSQL(last[1]); sql != "" {
				return validateSQL(sql)
			}
		}
	}

	loc := reSelectPos.FindStringIndex(aiResponse)
	if loc != nil {
		candidate := aiResponse[loc[0]:]

		if idx := strings.Index(candidate, "```"); idx != -1 {
			candidate = candidate[:idx]
		}
		if idx := strings.Index(candidate, "\n\n"); idx != -1 {
			after := strings.TrimSpace(candidate[idx:])
			peek := after
			if len(peek) > 20 {
				peek = peek[:20]
			}
			if !reSelectPos.MatchString(peek) {
				candidate = candidate[:idx]
			}
		}

		if sql := cleanSQL(candidate); len(sql) >= 20 {
			return validateSQL(sql)
		}
	}

	return "", fmt.Errorf("IA nao retornou SQL em formato correto")
}

func cleanSQL(raw string) string {
	lines := strings.Split(raw, "\n")
	var kept []string
	started := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !started {
			if trimmed == "" || trimmed == "..." || trimmed == ".." ||
				strings.HasPrefix(trimmed, "--") {
				continue
			}
			started = true
		}
		kept = append(kept, line)
	}
	return strings.TrimSpace(strings.Join(kept, "\n"))
}

func validateSQL(sql string) (string, error) {
	if reDangerous.MatchString(sql) {
		return "", fmt.Errorf("query contem operacoes nao permitidas")
	}
	return sql, nil
}
