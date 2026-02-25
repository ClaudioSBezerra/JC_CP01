CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    code VARCHAR(50) NOT NULL,
    ean VARCHAR(14),
    description VARCHAR(500) NOT NULL,
    category VARCHAR(255),
    unit VARCHAR(10) DEFAULT 'UN',
    current_stock NUMERIC(15,3) DEFAULT 0,
    avg_daily_sales NUMERIC(15,3) DEFAULT 0,
    stock_days NUMERIC(10,1) DEFAULT 0,
    last_purchase_date DATE,
    last_sale_date DATE,
    cost_price NUMERIC(15,4) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_products_company_id ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(company_id, code);
CREATE INDEX IF NOT EXISTS idx_products_stock_days ON products(company_id, stock_days DESC);
