import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface VkRowInput {
  cabinet: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rows: VkRowInput[] = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Нет строк для загрузки' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: accounts, error: accErr } = await supabase
      .from('ad_accounts')
      .select('startup_id, external_account_id, account_name')
      .eq('source', 'vk_ads');

    if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

    const startupByCab: Record<string, string> = {};
    for (const a of accounts || []) {
      if (a.external_account_id) startupByCab[a.external_account_id.trim().toLowerCase()] = a.startup_id;
      if (a.account_name) startupByCab[a.account_name.trim().toLowerCase()] = a.startup_id;
    }

    // Сохраняем существующие installs из AppMetrica для vk_ads, чтобы не затереть их
    const { data: existingVk } = await supabase
      .from('daily_marketing_metrics')
      .select('startup_id, date, installs')
      .eq('source', 'vk_ads');

    const existingInstalls: Record<string, number> = {};
    for (const ex of existingVk || []) {
      existingInstalls[`${ex.startup_id}__${ex.date}`] = ex.installs || 0;
    }

    const nowIso = new Date().toISOString();
    const aggMap: Record<
      string,
      {
        startup_id: string;
        date: string;
        source: 'vk_ads';
        spend: number;
        impressions: number;
        clicks: number;
        conversions: number;
        installs: number;
        bot_starts: number;
        sessions: number;
        upload_type: 'manual';
        updated_at: string;
      }
    > = {};

    const unmatched = new Set<string>();
    let matchedCount = 0;

    for (const r of rows) {
      const cab = String(r.cabinet || '').trim().toLowerCase();
      const startupId = body.startup_id ? String(body.startup_id) : startupByCab[cab];
      if (!startupId) {
        if (r.cabinet) unmatched.add(r.cabinet);
        continue;
      }

      const date = String(r.date || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

      matchedCount++;
      const key = `${startupId}__${date}`;
      if (!aggMap[key]) {
        aggMap[key] = {
          startup_id: startupId,
          date,
          source: 'vk_ads',
          spend: 0,
          impressions: 0,
          clicks: 0,
          conversions: 0,
          installs: existingInstalls[key] || 0,
          bot_starts: 0,
          sessions: 0,
          upload_type: 'manual',
          updated_at: nowIso,
        };
      }

      aggMap[key].spend += Number(r.spend) || 0;
      aggMap[key].impressions += Math.round(Number(r.impressions) || 0);
      aggMap[key].clicks += Math.round(Number(r.clicks) || 0);
      aggMap[key].conversions += Math.round(Number(r.conversions) || 0);
    }

    const toUpsert = Object.values(aggMap);
    if (toUpsert.length > 0) {
      const { error: upErr } = await supabase
        .from('daily_marketing_metrics')
        .upsert(toUpsert, { onConflict: 'startup_id,date,source' });

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      matched: matchedCount,
      upserted_rows: toUpsert.length,
      unmatched: Array.from(unmatched),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
