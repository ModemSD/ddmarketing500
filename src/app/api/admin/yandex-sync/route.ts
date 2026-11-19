import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface MarketingRow {
  startup_id: string;
  date: string;
  source: 'yandex_direct' | 'yandex_metrika' | 'appmetrica';
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  installs: number;
  bot_starts: number;
  sessions: number;
  upload_type: 'api';
  updated_at: string;
}

export async function POST(req: NextRequest) {
  try {
    const token = process.env.YANDEX_OAUTH_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'YANDEX_OAUTH_TOKEN не задан в .env.local' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const dateFrom = String(body.date_from || '2026-11-05');
    const dateTo = String(body.date_to || '2026-11-17');

    const supabase = getSupabaseAdmin();
    const { data: accounts, error: accErr } = await supabase
      .from('ad_accounts')
      .select('id, startup_id, source, external_account_id, account_name')
      .in('source', ['yandex_direct', 'yandex_metrika', 'appmetrica']);

    if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

    const nowIso = new Date().toISOString();
    const aggMap: Record<string, MarketingRow> = {};

    const addMetric = (
      startup_id: string,
      date: string,
      source: MarketingRow['source'],
      patch: Partial<MarketingRow>
    ) => {
      const key = `${startup_id}__${date}__${source}`;
      if (!aggMap[key]) {
        aggMap[key] = {
          startup_id,
          date,
          source,
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          installs: 0,
          bot_starts: 0,
          sessions: 0,
          upload_type: 'api',
          updated_at: nowIso,
        };
      }
      if (patch.spend) aggMap[key].spend += patch.spend;
      if (patch.impressions) aggMap[key].impressions += patch.impressions;
      if (patch.clicks) aggMap[key].clicks += patch.clicks;
      if (patch.conversions) aggMap[key].conversions += patch.conversions;
      if (patch.installs) aggMap[key].installs += patch.installs;
      if (patch.sessions) aggMap[key].sessions += patch.sessions;
    };

    const stats = { direct_ok: 0, direct_err: 0, metrika_ok: 0, metrika_err: 0, app_ok: 0, app_err: 0 };

    const directAccs = (accounts || []).filter((a) => a.source === 'yandex_direct');
    const metrikaAccs = (accounts || []).filter((a) => a.source === 'yandex_metrika');
    const appAccs = (accounts || []).filter((a) => a.source === 'appmetrica');

    // 1. Яндекс Директ (по account_name = porg-...)
    const directGoalIdsByStartup: Record<string, Set<string>> = {};
    await Promise.all(
      directAccs.map(async (acc) => {
        const login = (acc.account_name || acc.external_account_id).split(' | ')[0];
        try {
          const res = await fetch('https://api.direct.yandex.com/json/v5/reports', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Client-Login': login,
              'Accept-Language': 'ru',
              processingMode: 'auto',
              returnMoneyInMicros: 'false',
              skipReportHeader: 'true',
              skipReportSummary: 'true',
            },
            body: JSON.stringify({
              params: {
                SelectionCriteria: { DateFrom: dateFrom, DateTo: dateTo },
                FieldNames: ['Date', 'Impressions', 'Clicks', 'Cost', 'Conversions'],
                ReportName: `Bot500_${acc.startup_id}_${Date.now()}`,
                ReportType: 'ACCOUNT_PERFORMANCE_REPORT',
                DateRangeType: 'CUSTOM_DATE',
                Format: 'TSV',
                IncludeVAT: 'YES',
              },
            }),
          });
          if (!res.ok) {
            stats.direct_err++;
            return;
          }
          const tsv = await res.text();
          const lines = tsv.trim().split('\n');
          // Первая строка — заголовок Date\tImpressions\tClicks\tCost\tConversions
          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split('\t');
            if (cols.length < 5) continue;
            const [date, imp, clk, cost, conv] = cols;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
            addMetric(acc.startup_id, date, 'yandex_direct', {
              impressions: parseInt(imp, 10) || 0,
              clicks: parseInt(clk, 10) || 0,
              spend: parseFloat(cost) || 0,
              conversions: parseInt(conv, 10) || 0,
            });
          }
          stats.direct_ok++;

          // Достаём GoalId из стратегий кампаний Директа
          try {
            const campRes = await fetch('https://api.direct.yandex.com/json/v5/campaigns', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Client-Login': login,
                'Accept-Language': 'ru',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                method: 'get',
                params: {
                  SelectionCriteria: {},
                  FieldNames: ['Id', 'Name'],
                  TextCampaignFieldNames: ['BiddingStrategy', 'PriorityGoals'],
                  UnifiedCampaignFieldNames: ['BiddingStrategy', 'PriorityGoals'],
                },
              }),
            });
            if (campRes.ok) {
              const campText = await campRes.text();
              const matches = campText.matchAll(/"GoalId"\s*:\s*(\d+)/g);
              if (!directGoalIdsByStartup[acc.startup_id]) {
                directGoalIdsByStartup[acc.startup_id] = new Set();
              }
              for (const m of matches) {
                if (m[1] && m[1] !== '0') directGoalIdsByStartup[acc.startup_id].add(m[1]);
              }
            }
          } catch {
            // ignore
          }
        } catch {
          stats.direct_err++;
        }
      })
    );

    // 2. Яндекс Метрика (забираем только названия целей, по 1 запросу с паузой 200 мс)
    const goalNameById: Record<string, string> = {};
    for (const acc of metrikaAccs) {
      try {
        const goalsRes = await fetch(
          `https://api-metrika.yandex.net/management/v1/counter/${acc.external_account_id}/goals`,
          { headers: { Authorization: `OAuth ${token}` } }
        );
        if (goalsRes.ok) {
          const goalsJson = await goalsRes.json();
          for (const g of goalsJson.goals || []) {
            if (g.id && g.name) {
              goalNameById[String(g.id)] = g.name;
            }
          }
          stats.metrika_ok++;
        } else {
          stats.metrika_err++;
        }
      } catch {
        stats.metrika_err++;
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // 3. AppMetrica (разделяем платные установки -> installs и органику -> sessions)
    await Promise.all(
      appAccs.map(async (acc) => {
        try {
          const url = `https://api.appmetrica.yandex.ru/stat/v1/data?ids=${acc.external_account_id}&metrics=ym:i:installDevices&dimensions=ym:i:date,ym:i:publisher&date1=${dateFrom}&date2=${dateTo}&limit=500`;
          const res = await fetch(url, {
            headers: { Authorization: `OAuth ${token}` },
          });
          if (!res.ok) {
            stats.app_err++;
            return;
          }
          const json = await res.json();
          for (const row of json.data || []) {
            const date = row.dimensions?.[0]?.name;
            const publisher = String(row.dimensions?.[1]?.name || '').toLowerCase();
            if (!date) continue;
            const count = Math.round(row.metrics?.[0] || 0);
            if (publisher.includes('organic') || publisher.includes('органик') || publisher === '') {
              addMetric(acc.startup_id, date, 'appmetrica', { sessions: count });
            } else if (publisher.includes('direct') || publisher.includes('директ') || publisher.includes('yandex')) {
              addMetric(acc.startup_id, date, 'yandex_direct', { installs: count });
            } else if (publisher.includes('vk') || publisher.includes('вк') || publisher.includes('mytarget')) {
              addMetric(acc.startup_id, date, 'vk_ads' as unknown as 'appmetrica', { installs: count });
            } else if (publisher.includes('telegram') || publisher.includes('tg')) {
              addMetric(acc.startup_id, date, 'tg_ads' as unknown as 'appmetrica', { installs: count });
            } else {
              addMetric(acc.startup_id, date, 'appmetrica', { installs: count });
            }
          }
          stats.app_ok++;
        } catch {
          stats.app_err++;
        }
      })
    );

    // Сопоставляем GoalId Директа с названиями целей Метрики
    await Promise.all(
      directAccs.map(async (acc) => {
        const rawIds = Array.from(directGoalIdsByStartup[acc.startup_id] || []);
        const specificIds = rawIds.filter((id) => id !== '13');
        const gIds = specificIds.length > 0 ? specificIds : rawIds;
        const names = gIds
          .map((id) =>
            id === '13'
              ? 'Автоцель Директа (вовлечённые сессии / инсталлы)'
              : goalNameById[id] || `ID ${id}`
          )
          .filter((name) => Boolean(name) && !(acc.startup_id === '28026' && name.includes('Завершение примерки')));
        const baseLogin = (acc.account_name || acc.external_account_id).split(' | ')[0];
        if (names.length > 0) {
          await supabase
            .from('ad_accounts')
            .update({ account_name: `${baseLogin} | Цель: ${names.join(', ')}` })
            .eq('id', acc.id);
        }
      })
    );

    const rowsToUpsert = Object.values(aggMap);
    if (rowsToUpsert.length > 0) {
      const { error: upErr } = await supabase
        .from('daily_marketing_metrics')
        .upsert(rowsToUpsert, { onConflict: 'startup_id,date,source' });

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      upserted_rows: rowsToUpsert.length,
      stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
