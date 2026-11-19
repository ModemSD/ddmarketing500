import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const login = process.env.ADSTAT_LOGIN;
    const password = process.env.ADSTAT_PASSWORD;
    if (!login || !password) {
      return NextResponse.json(
        { error: 'ADSTAT_LOGIN или ADSTAT_PASSWORD не заданы в .env.local' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const dateFrom = String(body.date_from || '2026-11-05');
    const dateTo = String(body.date_to || '2026-11-17');

    // 1. Логин в Adstat v2
    const authBody = new URLSearchParams({ username: login, password });
    const lRes = await fetch('https://client.adstat.pro/api/v2/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: authBody.toString(),
    });
    const lJson = await lRes.json();
    if (!lRes.ok || !lJson.access_token) {
      return NextResponse.json(
        { error: `Ошибка авторизации Adstat: HTTP ${lRes.status}` },
        { status: 500 }
      );
    }

    // 2. Получаем маппинг кабинетов tg_ads из Supabase
    const supabase = getSupabaseAdmin();
    const { data: accounts, error: accErr } = await supabase
      .from('ad_accounts')
      .select('startup_id, external_account_id, account_name')
      .eq('source', 'tg_ads');

    if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });

    const startupByCab: Record<string, string> = {};
    for (const a of accounts || []) {
      if (a.external_account_id) startupByCab[a.external_account_id.trim()] = a.startup_id;
      if (a.account_name) startupByCab[a.account_name.trim()] = a.startup_id;
    }

    // 3. Пагинация по /api/v1/stats/page
    const aggMap: Record<
      string,
      {
        startup_id: string;
        date: string;
        source: 'tg_ads';
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
    > = {};

    const nowIso = new Date().toISOString();
    let cursor: string | null = null;
    let totalFetched = 0;
    let matchedRows = 0;

    do {
      const payload: Record<string, unknown> = {
        period_from: `${dateFrom}T00:00:00.000Z`,
        period_to: `${dateTo}T23:59:59.000Z`,
        period_grouping_unit: 'day',
        grouping: ['cabinet'],
        limit: 500,
      };
      if (cursor) payload.cursor = cursor;

      const sRes = await fetch('https://client.adstat.pro/api/v1/stats/page', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lJson.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!sRes.ok) {
        return NextResponse.json(
          { error: `Ошибка Adstat stats/page: HTTP ${sRes.status}` },
          { status: 500 }
        );
      }

      const sJson = await sRes.json();
      const rows = sJson.rows || [];
      totalFetched += rows.length;

      for (const r of rows) {
        const cabName = String(r.platform_cabinet_name || '').trim();
        const startupId = startupByCab[cabName];
        if (!startupId) continue;

        const date = String(r.period_date || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

        matchedRows++;
        const key = `${startupId}__${date}`;
        if (!aggMap[key]) {
          aggMap[key] = {
            startup_id: startupId,
            date,
            source: 'tg_ads',
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

        const rawSpent = Number(r.exchanged_spent ?? r.original_spent ?? 0) || 0;
        const currency = String(r.exchange_currency || r.original_currency || 'EUR').toUpperCase();
        const spent = currency === 'RUB' ? rawSpent : rawSpent * 100;
        const views = Math.round(Number(r.views || 0));
        const clicks = Math.round(Number(r.clicks || 0));
        const actions = Math.round(Number(r.actions || 0));

        aggMap[key].spend += spent;
        aggMap[key].impressions += views;
        aggMap[key].clicks += clicks;
        aggMap[key].conversions += actions;
        aggMap[key].bot_starts += actions;
      }

      cursor = sJson.cursor || null;
    } while (cursor);

    const rowsToUpsert = Object.values(aggMap);
    if (rowsToUpsert.length > 0) {
      const { error: upErr } = await supabase
        .from('daily_marketing_metrics')
        .upsert(rowsToUpsert, { onConflict: 'startup_id,date,source' });

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      fetched: totalFetched,
      matched: matchedRows,
      upserted_rows: rowsToUpsert.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
