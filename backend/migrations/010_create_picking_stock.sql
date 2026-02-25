CREATE TABLE IF NOT EXISTS picking_stock (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    filial VARCHAR(5) NOT NULL,
    location_id INTEGER REFERENCES picking_locations(id) ON DELETE CASCADE,
    product_code VARCHAR(50) NOT NULL,
    product_description VARCHAR(500) DEFAULT '',
    current_qty NUMERIC(15,3) DEFAULT 0,
    min_qty NUMERIC(15,3) DEFAULT 0,
    max_qty NUMERIC(15,3) DEFAULT 0,
    abc_class CHAR(1) DEFAULT 'C',
    last_sync_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, filial, location_id, product_code)
);

CREATE INDEX IF NOT EXISTS idx_picking_stock_company ON picking_stock(company_id, filial);
CREATE INDEX IF NOT EXISTS idx_picking_stock_low ON picking_stock(company_id, filial, current_qty, min_qty);
