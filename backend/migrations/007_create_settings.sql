CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) UNIQUE,
    low_turnover_days INTEGER DEFAULT 90,
    warning_turnover_days INTEGER DEFAULT 60,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
