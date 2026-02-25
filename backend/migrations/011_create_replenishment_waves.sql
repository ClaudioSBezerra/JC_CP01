CREATE TABLE IF NOT EXISTS replenishment_waves (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    filial VARCHAR(5) NOT NULL,
    wave_number VARCHAR(30) NOT NULL,
    status VARCHAR(20) DEFAULT 'gerada',
    total_tasks INTEGER DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    triggered_by VARCHAR(20) DEFAULT 'scheduler',
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    sent_to_winthor_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    winthor_response TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    UNIQUE(company_id, wave_number)
);

CREATE INDEX IF NOT EXISTS idx_waves_company ON replenishment_waves(company_id, filial);
CREATE INDEX IF NOT EXISTS idx_waves_status ON replenishment_waves(company_id, status);
CREATE INDEX IF NOT EXISTS idx_waves_generated ON replenishment_waves(company_id, generated_at DESC);
