import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const dateFrom = req.nextUrl.searchParams.get('date_from') || '2026-11-05';
    const dateTo = req.nextUrl.searchParams.get('date_to') || '2026-11-17';

    const supabase = getSupabaseAdmin();
    const [{ data: startups, error: sErr }, { data: accounts }] = await Promise.all([
      supabase.from('startups').select('id, name').eq('is_active', true).order('id'),
      supabase.from('ad_accounts').select('startup_id, source, account_name'),
    ]);

    const formatErr = (msg: string) =>
      msg.includes('<html') || msg.includes('<!DOCTYPE')
        ? 'Supabase временно недоступен (ошибка Cloudflare 520/525 на стороне хостинга). Попробуйте обновить через минуту.'
        : msg;

    if (sErr) return NextResponse.json({ error: formatErr(sErr.message) }, { status: 500 });

    // Постранично забираем все строки (Supabase PostgREST режет на 1000 за раз)
    const allMetrics: Record<string, unknown>[] = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data: page, error: mErr } = await supabase
        .from('daily_marketing_metrics')
        .select('*')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false })
        .range(from, from + pageSize - 1);

      if (mErr) return NextResponse.json({ error: formatErr(mErr.message) }, { status: 500 });
      if (!page || page.length === 0) break;
      allMetrics.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }

    return NextResponse.json({
      startups: startups || [],
      metrics: allMetrics,
      accounts: accounts || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
