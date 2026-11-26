-- Таблица технического аудита стартапов (DAU и Tool Calls)
CREATE TABLE IF NOT EXISTS tech_audit (
  startup_id TEXT PRIMARY KEY REFERENCES startups(id) ON DELETE CASCADE,
  dau_status TEXT NOT NULL DEFAULT '',
  dau_comment TEXT NOT NULL DEFAULT '',
  tool_calls_status TEXT NOT NULL DEFAULT '',
  tool_calls_comment TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Начальные статусы со скриншотов (только для существующих в startups ID)
INSERT INTO tech_audit (startup_id, dau_status, tool_calls_status)
SELECT v.startup_id, v.dau_status, v.tool_calls_status
FROM (VALUES
  ('27719', 'compliant', 'compliant'),
  ('28431', 'partial', 'compliant'),
  ('28554', 'partial', 'partial'),
  ('28766', 'compliant', 'compliant'),
  ('28778', 'compliant', 'partial'),
  ('28870', 'compliant', 'partial'),
  ('29008', 'compliant', 'partial'),
  ('29157', 'partial', 'partial'),
  ('29240', 'compliant', 'partial'),
  ('29401', 'compliant', 'partial'),
  ('29452', 'compliant', 'partial'),
  ('29453', 'compliant', 'compliant'),
  ('29754', 'compliant', 'compliant'),
  ('29886', 'partial', 'partial'),
  ('30010', 'compliant', 'compliant'),
  ('30418', 'compliant', 'compliant')
) AS v(startup_id, dau_status, tool_calls_status)
WHERE EXISTS (SELECT 1 FROM startups s WHERE s.id = v.startup_id)
ON CONFLICT (startup_id) DO NOTHING;
