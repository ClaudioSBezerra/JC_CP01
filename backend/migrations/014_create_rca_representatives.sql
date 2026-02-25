CREATE TABLE IF NOT EXISTS rca_representatives (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    user_id INTEGER REFERENCES users(id) NOT NULL,
    vehicle_type VARCHAR(50) DEFAULT '',
    vehicle_plate VARCHAR(20) DEFAULT '',
    territory VARCHAR(255) DEFAULT '',
    phone VARCHAR(30) DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rca_rep_company ON rca_representatives(company_id);
CREATE INDEX IF NOT EXISTS idx_rca_rep_user ON rca_representatives(user_id);
