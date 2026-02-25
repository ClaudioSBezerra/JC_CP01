CREATE TABLE IF NOT EXISTS approval_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES purchase_orders(id),
    item_id INTEGER REFERENCES purchase_order_items(id),
    action VARCHAR(30) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    user_name VARCHAR(255),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_history_order_id ON approval_history(order_id);
CREATE INDEX IF NOT EXISTS idx_approval_history_created_at ON approval_history(created_at DESC);
