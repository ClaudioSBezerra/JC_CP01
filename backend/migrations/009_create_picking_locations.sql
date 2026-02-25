CREATE TABLE IF NOT EXISTS picking_locations (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    filial VARCHAR(5) NOT NULL,
    location_code VARCHAR(20) NOT NULL,
    aisle VARCHAR(5) DEFAULT '',
    bay INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    position INTEGER DEFAULT 1,
    zone VARCHAR(20) DEFAULT 'picking',
    capacity_boxes INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, filial, location_code)
);

CREATE INDEX IF NOT EXISTS idx_picking_loc_company ON picking_locations(company_id, filial);
