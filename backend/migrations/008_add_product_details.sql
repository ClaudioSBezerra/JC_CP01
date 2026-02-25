-- Migration 008: Add product detail fields for Sprint 2
-- Adds: branch stock/sales/days, seasonality, lead time, min/max DDV

ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_filial_01 NUMERIC(15,3) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_filial_02 NUMERIC(15,3) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_filial_03 NUMERIC(15,3) DEFAULT 0;

ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_daily_sales_filial_01 NUMERIC(15,3) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_daily_sales_filial_02 NUMERIC(15,3) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_daily_sales_filial_03 NUMERIC(15,3) DEFAULT 0;

ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_days_filial_01 NUMERIC(10,1) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_days_filial_02 NUMERIC(10,1) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_days_filial_03 NUMERIC(10,1) DEFAULT 0;

ALTER TABLE products ADD COLUMN IF NOT EXISTS seasonality_type VARCHAR(30) DEFAULT 'media';
ALTER TABLE products ADD COLUMN IF NOT EXISTS peak_months VARCHAR(50);

ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_lead_time_days INTEGER DEFAULT 7;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_days INTEGER DEFAULT 15;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock_days INTEGER DEFAULT 90;
