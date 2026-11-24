-- Таблица динамических настроек дашборда (например, общий бюджет)
CREATE TABLE IF NOT EXISTS dashboard_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Начальное значение общего бюджета (в рублях) — можно менять прямо в Supabase Table Editor
INSERT INTO dashboard_settings (key, value)
VALUES ('total_budget_rub', '0')
ON CONFLICT (key) DO NOTHING;
