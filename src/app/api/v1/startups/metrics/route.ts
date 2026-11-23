import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function getYesterdayMsk(): string {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('date_from') || '2026-11-05';
  const dateTo = searchParams.get('date_to') || getYesterdayMsk();

  const sb = getSupabaseAdmin();

  const [{ data: startups, error: sErr }, { data: days, error: dErr }] = await Promise.all([
    sb.from('startups').select('id, name').eq('is_active', true).order('id'),
    sb
      .from('daily_product_metrics')
      .select('startup_id, date, dau, llm_requests, tool_requests, total_users')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: true }),
  ]);

  if (sErr || dErr) {
    return NextResponse.json(
      { ok: false, error: sErr?.message || dErr?.message || 'Database error' },
      { status: 500 }
    );
  }

  const byStartup: Record<string, typeof days> = {};
  for (const row of days || []) {
    if (!byStartup[row.startup_id]) byStartup[row.startup_id] = [];
    byStartup[row.startup_id].push(row);
  }

  const result = (startups || []).map((s) => {
    const sDays = byStartup[s.id] || [];
    const sumDau = sDays.reduce((a, d) => a + (d.dau || 0), 0);
    const avgDau = sDays.length > 0 ? Math.round(sumDau / sDays.length) : 0;
    const peakDau = sDays.length > 0 ? Math.max(...sDays.map((d) => d.dau || 0)) : 0;

    let currentStreak = 0;
    let bestStreak = 0;
    for (const d of sDays) {
      if ((d.dau || 0) >= 1000) {
        currentStreak += 1;
        if (currentStreak > bestStreak) bestStreak = currentStreak;
      } else {
        currentStreak = 0;
      }
    }
    const cappedBest = Math.min(14, bestStreak);

    const totalUsers = sDays.length > 0 ? sDays[sDays.length - 1].total_users || 0 : 0;
    const sumToolCalls = sDays.reduce(
      (a, d) => a + (d.llm_requests || 0) + (d.tool_requests || 0),
      0
    );
    const toolCallsPerDau = sumDau > 0 ? Number((sumToolCalls / sumDau).toFixed(1)) : 0;

    return {
      id: s.id,
      name: s.name,
      avg_dau: avgDau,
      peak_dau: peakDau,
      streak_1000: {
        best: cappedBest,
        target: 14,
        label: `${cappedBest}/14`,
        current: currentStreak,
      },
      total_users: totalUsers,
      tool_calls_per_dau: toolCallsPerDau,
    };
  });

  return NextResponse.json({
    ok: true,
    date_from: dateFrom,
    date_to: dateTo,
    data: result,
  });
}
