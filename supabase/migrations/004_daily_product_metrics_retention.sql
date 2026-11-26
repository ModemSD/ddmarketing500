-- Метрики удержания (Retention D1, D3, D7, D14) в daily_product_metrics
ALTER TABLE daily_product_metrics
ADD COLUMN IF NOT EXISTS retained_d1 INTEGER,
ADD COLUMN IF NOT EXISTS retained_d3 INTEGER,
ADD COLUMN IF NOT EXISTS retained_d7 INTEGER,
ADD COLUMN IF NOT EXISTS retained_d14 INTEGER;
