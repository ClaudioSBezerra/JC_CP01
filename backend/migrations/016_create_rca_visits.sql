CREATE TABLE IF NOT EXISTS rca_visits (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    representative_id INTEGER REFERENCES rca_representatives(id) NOT NULL,
    customer_id INTEGER REFERENCES rca_customers(id) NOT NULL,
    visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'agendada',
    checkin_at TIMESTAMPTZ,
    checkin_lat NUMERIC(10,7),
    checkin_lng NUMERIC(10,7),
    checkout_at TIMESTAMPTZ,
    checkout_lat NUMERIC(10,7),
    checkout_lng NUMERIC(10,7),
    duration_minutes INTEGER,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(representative_id, customer_id, visit_date)
);

-- status values: agendada | em_visita | concluida | nao_visitado
CREATE INDEX IF NOT EXISTS idx_rca_visits_rep_date ON rca_visits(representative_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_rca_visits_company ON rca_visits(company_id, visit_date DESC);
