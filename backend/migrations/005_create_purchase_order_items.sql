CREATE TABLE IF NOT EXISTS purchase_order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    product_code VARCHAR(50) NOT NULL,
    product_description VARCHAR(500),
    quantity NUMERIC(15,3) NOT NULL,
    unit_price NUMERIC(15,4) NOT NULL,
    total_price NUMERIC(15,2) NOT NULL,
    stock_days NUMERIC(10,1) DEFAULT 0,
    current_stock NUMERIC(15,3) DEFAULT 0,
    avg_daily_sales NUMERIC(15,3) DEFAULT 0,
    is_low_turnover BOOLEAN DEFAULT FALSE,
    item_status VARCHAR(30) DEFAULT 'pendente',
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON purchase_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_low_turnover ON purchase_order_items(order_id, is_low_turnover);
