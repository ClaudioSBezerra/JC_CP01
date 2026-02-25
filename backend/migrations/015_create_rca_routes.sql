CREATE TABLE IF NOT EXISTS rca_routes (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    representative_id INTEGER REFERENCES rca_representatives(id) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rca_routes_company ON rca_routes(company_id);
CREATE INDEX IF NOT EXISTS idx_rca_routes_rep ON rca_routes(representative_id);

CREATE TABLE IF NOT EXISTS rca_customers (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    route_id INTEGER REFERENCES rca_routes(id) ON DELETE CASCADE NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) DEFAULT '',
    phone VARCHAR(30) DEFAULT '',
    city VARCHAR(100) DEFAULT '',
    neighborhood VARCHAR(100) DEFAULT '',
    address VARCHAR(255) DEFAULT '',
    address_number VARCHAR(20) DEFAULT '',
    lat NUMERIC(10,7),
    lng NUMERIC(10,7),
    priority INTEGER DEFAULT 1,
    notes TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rca_customers_route ON rca_customers(route_id, priority ASC);
CREATE INDEX IF NOT EXISTS idx_rca_customers_company ON rca_customers(company_id);
