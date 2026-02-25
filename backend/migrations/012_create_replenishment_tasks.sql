CREATE TABLE IF NOT EXISTS replenishment_tasks (
    id SERIAL PRIMARY KEY,
    wave_id INTEGER REFERENCES replenishment_waves(id) ON DELETE CASCADE,
    company_id INTEGER REFERENCES companies(id) NOT NULL,
    filial VARCHAR(5) NOT NULL,
    product_code VARCHAR(50) NOT NULL,
    product_description VARCHAR(500) DEFAULT '',
    location_code VARCHAR(20) NOT NULL,
    current_qty NUMERIC(15,3) DEFAULT 0,
    min_qty NUMERIC(15,3) DEFAULT 0,
    qty_to_replenish NUMERIC(15,3) DEFAULT 0,
    abc_class CHAR(1) DEFAULT 'C',
    priority INTEGER DEFAULT 3,
    status VARCHAR(20) DEFAULT 'pendente',
    winthor_task_id VARCHAR(50) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_wave ON replenishment_tasks(wave_id);
CREATE INDEX IF NOT EXISTS idx_tasks_company ON replenishment_tasks(company_id, filial);
