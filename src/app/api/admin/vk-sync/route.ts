import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getYesterdayMsk(): string {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const VK_CABINET_TO_STARTUP: Record<string, string> = {
  '1092349155': '29507',
  '1092303191': '29453',
  '1092251809': '27569',
  '1092163454': '28554',
  '1092155366': '29499',
  '1092155346': '29157',
  '1092144371': '28431',
  '1092144354': '30418',
  '1092137662': '29203',
};

export async function POST(req: NextRequest) {
  let dateFrom = getYesterdayMsk();
  let dateTo = dateFrom;
  try {
    const body = await req.json();
    if (body?.date_from) dateFrom = body.date_from;
    if (body?.date_to) dateTo = body.date_to;
  } catch {
    // use defaults
  }

  const sb = getSupabaseAdmin();
  const { data: startups } = await sb.from('startups').select('id').eq('is_active', true);
  const validIds = new Set((startups || []).map((s) => s.id));

  let tokens: string[] = [];
  if (process.env.VK_ADS_TOKENS) {
    try {
      const parsed = JSON.parse(process.env.VK_ADS_TOKENS);
      if (Array.isArray(parsed)) tokens = parsed.filter(Boolean);
    } catch {
      tokens = process.env.VK_ADS_TOKENS.split(',').map((t) => t.trim()).filter(Boolean);
    }
  }

  if (tokens.length === 0) {
    return NextResponse.json({ ok: false, error: 'VK_ADS_TOKENS env var is not set' }, { status: 400 });
  }

  const agg: Record<string, { startup_id: string; date: string; impressions: number; clicks: number; spend: number; conversions: number }> = {};
  let okCabinets = 0;
  let errCabinets = 0;

  for (const token of tokens) {
    try {
      const userRes = await fetch('https://ads.vk.com/api/v2/user.json', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) {
        errCabinets++;
        continue;
      }
      const userJson = await userRes.json();
      const cabinetId = String(userJson.id || '');
      const mappedStartupId = VK_CABINET_TO_STARTUP[cabinetId];

      let planToStartup: Record<string, string> = {};
      if (!mappedStartupId) {
        const plansRes = await fetch('https://ads.vk.com/api/v2/ad_plans.json?limit=250', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (plansRes.ok) {
          const plansJson = await plansRes.json();
          for (const p of plansJson.items || []) {
            const m = String(p.name || '').match(/\b(\d{5})\b/);
            if (m && validIds.has(m[1])) {
              planToStartup[String(p.id)] = m[1];
            }
          }
        }
      }

      const statsRes = await fetch(
        `https://ads.vk.com/api/v2/statistics/ad_plans/day.json?date_from=${dateFrom}&date_to=${dateTo}&metrics=base`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!statsRes.ok) {
        errCabinets++;
        continue;
      }
      const statsJson = await statsRes.json();
      for (const item of statsJson.items || []) {
        const sid = mappedStartupId || planToStartup[String(item.id)];
        if (!sid) continue;
        for (const row of item.rows || []) {
          const base = row.base || {};
          const key = `${sid}__${row.date}`;
          if (!agg[key]) {
            agg[key] = { startup_id: sid, date: row.date, impressions: 0, clicks: 0, spend: 0, conversions: 0 };
          }
          agg[key].impressions += Number(base.shows || 0);
          agg[key].clicks += Number(base.clicks || 0);
          agg[key].spend += Number(base.spent || 0);
          agg[key].conversions += Number(base.vk?.goals || base.goals || 0);
        }
      }
      okCabinets++;
    } catch {
      errCabinets++;
    }
  }

  const rows = Object.values(agg).map((r) => ({
    startup_id: r.startup_id,
    date: r.date,
    source: 'vk_ads',
    impressions: r.impressions,
    clicks: r.clicks,
    spend: Number(r.spend.toFixed(2)),
    conversions: r.conversions,
  }));

  if (rows.length > 0) {
    const { error } = await sb
      .from('marketing_metrics')
      .upsert(rows, { onConflict: 'startup_id,date,source' });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    cabinets_ok: okCabinets,
    cabinets_err: errCabinets,
    upserted_rows: rows.length,
  });
}
