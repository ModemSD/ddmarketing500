-- 1. Справочник стартапов
CREATE TABLE IF NOT EXISTS startups (
  id TEXT PRIMARY KEY, -- Например: '25555'
  name TEXT NOT NULL,  -- Например: 'Енот'
  api_url TEXT,
  api_token_encrypted TEXT,
  api_status TEXT NOT NULL DEFAULT 'unconfigured' CHECK (api_status IN ('ok', 'error', 'unconfigured')),
  last_check_at TIMESTAMPTZ,
  last_error TEXT,
  marketing_start_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Библиотека рекламных кабинетов и счётчиков аналитики
-- Поддерживает несколько кабинетов/счётчиков одного типа у одного стартапа (например, 2 Метрики)
CREATE TABLE IF NOT EXISTS ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id TEXT NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('yandex_direct', 'vk_ads', 'tg_ads', 'yandex_metrika', 'appmetrica')),
  external_account_id TEXT NOT NULL,
  account_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_accounts_startup ON ad_accounts(startup_id);

-- 3. Ежедневные продуктовые метрики стартапов (по ТЗ)
CREATE TABLE IF NOT EXISTS daily_product_metrics (
  startup_id TEXT NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  dau INTEGER NOT NULL DEFAULT 0,
  llm_requests INTEGER NOT NULL DEFAULT 0,
  tool_requests INTEGER NOT NULL DEFAULT 0,
  total_users INTEGER NOT NULL DEFAULT 0,
  new_users INTEGER NOT NULL DEFAULT 0,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (startup_id, date)
);

CREATE INDEX IF NOT EXISTS idx_product_metrics_date ON daily_product_metrics(date DESC);

-- 4. Ежедневные маркетинговые метрики (API + ручная загрузка VK/TG)
CREATE TABLE IF NOT EXISTS daily_marketing_metrics (
  startup_id TEXT NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('yandex_direct', 'vk_ads', 'tg_ads', 'yandex_metrika', 'appmetrica')),
  spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0, -- Целевые действия (кол-во)
  installs INTEGER NOT NULL DEFAULT 0,    -- Установки
  bot_starts INTEGER NOT NULL DEFAULT 0,  -- Старты бота (TG)
  sessions INTEGER NOT NULL DEFAULT 0,    -- Визиты (Метрика)
  upload_type TEXT NOT NULL DEFAULT 'api' CHECK (upload_type IN ('api', 'manual')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (startup_id, date, source)
);

CREATE INDEX IF NOT EXISTS idx_marketing_metrics_date ON daily_marketing_metrics(date DESC);

-- 5. Логи синхронизаций и проверок API (Health Check)
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  startup_id TEXT REFERENCES startups(id) ON DELETE SET NULL,
  source TEXT NOT NULL, -- 'product_api', 'yandex_direct', 'vk_ads', etc.
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  http_code INTEGER,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_created_at ON sync_logs(created_at DESC);

-- 6. Витрина: маркетинг с расчётными метриками (CTR, CPC, CPA, CPI, CPA TG) по дням и источникам
CREATE OR REPLACE VIEW v_marketing_daily AS
SELECT
  m.startup_id,
  s.name AS startup_name,
  m.date,
  m.source,
  m.spend,
  m.impressions,
  m.clicks,
  CASE WHEN m.impressions > 0 THEN ROUND((m.clicks::NUMERIC / m.impressions) * 100, 2) ELSE 0 END AS ctr,
  CASE WHEN m.clicks > 0 THEN ROUND(m.spend / m.clicks, 2) ELSE 0 END AS cpc,
  m.conversions,
  CASE WHEN m.conversions > 0 THEN ROUND(m.spend / m.conversions, 2) ELSE 0 END AS cpa,
  m.installs,
  CASE WHEN m.installs > 0 THEN ROUND(m.spend / m.installs, 2) ELSE 0 END AS cpi,
  m.bot_starts,
  CASE WHEN m.bot_starts > 0 THEN ROUND(m.spend / m.bot_starts, 2) ELSE 0 END AS cpa_tg,
  m.sessions,
  m.upload_type
FROM daily_marketing_metrics m
JOIN startups s ON s.id = m.startup_id;

-- 7. Сводная витрина: Продукт + Агрегированный маркетинг по каждому стартапу и дню
CREATE OR REPLACE VIEW v_daily_startup_summary AS
WITH m_agg AS (
  SELECT
    startup_id,
    date,
    SUM(spend) AS total_spend,
    SUM(impressions) AS total_impressions,
    SUM(clicks) AS total_clicks,
    SUM(conversions) AS total_conversions,
    SUM(installs) AS total_installs,
    SUM(bot_starts) AS total_bot_starts,
    SUM(sessions) AS total_sessions
  FROM daily_marketing_metrics
  GROUP BY startup_id, date
)
SELECT
  COALESCE(p.startup_id, m.startup_id) AS startup_id,
  s.name AS startup_name,
  COALESCE(p.date, m.date) AS date,
  -- Продуктовые метрики
  COALESCE(p.dau, 0) AS dau,
  COALESCE(p.llm_requests, 0) AS llm_requests,
  COALESCE(p.tool_requests, 0) AS tool_requests,
  COALESCE(p.llm_requests, 0) + COALESCE(p.tool_requests, 0) AS tool_calls,
  COALESCE(p.total_users, 0) AS total_users,
  COALESCE(p.new_users, 0) AS new_users,
  COALESCE(p.is_final, FALSE) AS is_final,
  -- Маркетинг (суммарно по всем каналам)
  COALESCE(m.total_spend, 0) AS spend,
  COALESCE(m.total_impressions, 0) AS impressions,
  COALESCE(m.total_clicks, 0) AS clicks,
  COALESCE(m.total_conversions, 0) AS conversions,
  COALESCE(m.total_installs, 0) AS installs,
  COALESCE(m.total_bot_starts, 0) AS bot_starts,
  COALESCE(m.total_sessions, 0) AS sessions,
  -- Расчётные метрики
  CASE WHEN COALESCE(m.total_impressions, 0) > 0 THEN ROUND((m.total_clicks::NUMERIC / m.total_impressions) * 100, 2) ELSE 0 END AS ctr,
  CASE WHEN COALESCE(m.total_clicks, 0) > 0 THEN ROUND(m.total_spend / m.total_clicks, 2) ELSE 0 END AS cpc,
  CASE WHEN COALESCE(m.total_conversions, 0) > 0 THEN ROUND(m.total_spend / m.total_conversions, 2) ELSE 0 END AS cpa,
  CASE WHEN COALESCE(m.total_installs, 0) > 0 THEN ROUND(m.total_spend / m.total_installs, 2) ELSE 0 END AS cpi,
  CASE WHEN COALESCE(m.total_bot_starts, 0) > 0 THEN ROUND(m.total_spend / m.total_bot_starts, 2) ELSE 0 END AS cpa_tg
FROM daily_product_metrics p
FULL OUTER JOIN m_agg m ON p.startup_id = m.startup_id AND p.date = m.date
JOIN startups s ON s.id = COALESCE(p.startup_id, m.startup_id);
