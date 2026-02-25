-- Extend settings with picking configuration
ALTER TABLE settings ADD COLUMN IF NOT EXISTS picking_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS winthor_api_url TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS winthor_api_key TEXT DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER DEFAULT 30;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS sync_schedule TEXT DEFAULT '["06:00","12:00","18:00"]';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS active_filiais TEXT DEFAULT '["01","02","03"]';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS use_mock_winthor BOOLEAN DEFAULT TRUE;

-- Winthor sync log
CREATE TABLE IF NOT EXISTS winthor_sync_log (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    filial VARCHAR(5) DEFAULT '',
    sync_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL,
    records_processed INTEGER DEFAULT 0,
    error_message TEXT DEFAULT '',
    duration_ms INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_log_company ON winthor_sync_log(company_id, synced_at DESC);

-- Fragmentation history (score recorded each scheduler cycle)
CREATE TABLE IF NOT EXISTS fragmentation_history (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    filial VARCHAR(5) NOT NULL,
    score NUMERIC(5,1) DEFAULT 0,
    locations_below_min INTEGER DEFAULT 0,
    total_active_locations INTEGER DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frag_history ON fragmentation_history(company_id, filial, recorded_at DESC);
