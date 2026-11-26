import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { decryptToken } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

interface DailyMetricRow {
  date: string;
  dau: number;
  llm_requests: number;
  tool_requests: number;
  total_users: number;
  new_users?: number;
  retained_d1?: number | null;
  retained_d3?: number | null;
  retained_d7?: number | null;
  retained_d14?: number | null;
  is_final?: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const dateFrom = req.nextUrl.searchParams.get('date_from') || '2026-11-05';
    const dateTo = req.nextUrl.searchParams.get('date_to') || '2026-11-17';
    const startupId = req.nextUrl.searchParams.get('startup_id');

    const supabase = getSupabaseAdmin();

    let startupsQuery = supabase
      .from('startups')
      .select('id, name, api_url, api_status')
      .eq('is_active', true)
      .order('id', { ascending: true });

    if (startupId && startupId !== 'all') {
      startupsQuery = startupsQuery.eq('id', startupId);
    }

    const { data: startups, error: sErr } = await startupsQuery;
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    let metricsQuery = supabase
      .from('daily_product_metrics')
      .select('*')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false });

    if (startupId && startupId !== 'all') {
      metricsQuery = metricsQuery.eq('startup_id', startupId);
    }

    const { data: metrics, error: mErr } = await metricsQuery;
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    const byStartup: Record<string, DailyMetricRow[]> = {};
    for (const row of metrics || []) {
      if (!byStartup[row.startup_id]) byStartup[row.startup_id] = [];
      byStartup[row.startup_id].push(row);
    }

    const result = (startups || []).map((s) => ({
      ...s,
      days: byStartup[s.id] || [],
    }));

    return NextResponse.json({ startups: result, date_from: dateFrom, date_to: dateTo });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const nowMsk = new Date(Date.now() + 3 * 3600 * 1000);
    const yesterdayMsk = new Date(nowMsk);
    yesterdayMsk.setUTCDate(yesterdayMsk.getUTCDate() - 1);
    const from15dMsk = new Date(yesterdayMsk);
    from15dMsk.setUTCDate(from15dMsk.getUTCDate() - 14);
    const dateFrom = String(body.date_from || from15dMsk.toISOString().slice(0, 10));
    const dateTo = String(body.date_to || yesterdayMsk.toISOString().slice(0, 10));
    const startupIds: string[] | null =
      Array.isArray(body.startup_ids) && body.startup_ids.length > 0
        ? body.startup_ids.map(String)
        : null;
    const startupId = body.startup_id && body.startup_id !== 'all' ? String(body.startup_id) : null;

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('startups')
      .select('id, name, api_url, api_token_encrypted')
      .eq('is_active', true)
      .not('api_url', 'is', null)
      .not('api_token_encrypted', 'is', null);

    if (startupIds) {
      query = query.in('id', startupIds);
    } else if (startupId) {
      query = query.eq('id', startupId);
    }

    const { data: startups, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = await Promise.all(
      (startups || []).map(async (s) => {
        const start = Date.now();
        try {
          const token = decryptToken(s.api_token_encrypted);
          const url = new URL(s.api_url);
          url.searchParams.set('date_from', dateFrom);
          url.searchParams.set('date_to', dateTo);

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 45000);

          const res = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
            signal: controller.signal,
            cache: 'no-store',
          });
          clearTimeout(timeout);

          if (!res.ok) {
            return { startup_id: s.id, name: s.name, status: 'error', count: 0, error: `HTTP ${res.status}` };
          }

          const json = await res.json();
          if (!json || !Array.isArray(json.data)) {
            return { startup_id: s.id, name: s.name, status: 'error', count: 0, error: 'Нет массива data' };
          }

          const nowIso = new Date().toISOString();
          const rows = json.data
            .filter((d: DailyMetricRow) => d && d.date)
            .map((d: DailyMetricRow) => ({
              startup_id: s.id,
              date: String(d.date).slice(0, 10),
              dau: Number(d.dau) || 0,
              llm_requests: Number(d.llm_requests) || 0,
              tool_requests: Number(d.tool_requests) || 0,
              total_users: Number(d.total_users) || 0,
              new_users: Number(d.new_users) || 0,
              retained_d1: d.retained_d1 != null ? Number(d.retained_d1) : null,
              retained_d3: d.retained_d3 != null ? Number(d.retained_d3) : null,
              retained_d7: d.retained_d7 != null ? Number(d.retained_d7) : null,
              retained_d14: d.retained_d14 != null ? Number(d.retained_d14) : null,
              is_final: Boolean(d.is_final),
              fetched_at: nowIso,
            }));

          if (rows.length > 0) {
            const { error: upErr } = await supabase
              .from('daily_product_metrics')
              .upsert(rows, { onConflict: 'startup_id,date' });

            if (upErr) {
              return { startup_id: s.id, name: s.name, status: 'error', count: 0, error: upErr.message };
            }
          }

          await supabase.from('sync_logs').insert({
            startup_id: s.id,
            source: 'product_api_sync',
            status: 'ok',
            http_code: res.status,
            duration_ms: Date.now() - start,
          });

          return { startup_id: s.id, name: s.name, status: 'ok', count: rows.length, error: null };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Ошибка сети';
          return { startup_id: s.id, name: s.name, status: 'error', count: 0, error: msg };
        }
      })
    );

    return NextResponse.json({
      total: results.length,
      ok: results.filter((r) => r.status === 'ok').length,
      error: results.filter((r) => r.status === 'error').length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
