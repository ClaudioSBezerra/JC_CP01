CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(255) NOT NULL,
    supplier_cnpj VARCHAR(18),
    buyer_id INTEGER REFERENCES users(id),
    buyer_name VARCHAR(255),
    status VARCHAR(30) DEFAULT 'pendente',
    total_value NUMERIC(15,2) DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    flagged_items INTEGER DEFAULT 0,
    notes TEXT,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_id ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created_at ON purchase_orders(created_at DESC);
