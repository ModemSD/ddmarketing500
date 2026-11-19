import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const startupId = String(body.startup_id || '').trim();
    const goalText = String(body.goal || '').trim();

    if (!startupId || !goalText) {
      return NextResponse.json({ error: 'startup_id и goal обязательны' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: acc, error: fErr } = await supabase
      .from('ad_accounts')
      .select('id, external_account_id, account_name')
      .eq('startup_id', startupId)
      .eq('source', 'yandex_direct')
      .maybeSingle();

    if (fErr || !acc) {
      return NextResponse.json({ error: 'Кабинет Директа не найден' }, { status: 404 });
    }

    let resolvedGoal = goalText;
    const token = process.env.YANDEX_OAUTH_TOKEN;
    if (/^\d+$/.test(goalText) && token) {
      const { data: metrikaAccs } = await supabase
        .from('ad_accounts')
        .select('external_account_id')
        .eq('startup_id', startupId)
        .eq('source', 'yandex_metrika');

      for (const mAcc of metrikaAccs || []) {
        try {
          const res = await fetch(
            `https://api-metrika.yandex.net/management/v1/counter/${mAcc.external_account_id}/goals`,
            { headers: { Authorization: `OAuth ${token}` } }
          );
          if (res.ok) {
            const json = await res.json();
            const found = (json.goals || []).find(
              (g: { id?: number; name?: string }) => String(g.id) === goalText
            );
            if (found?.name) {
              resolvedGoal = found.name;
              break;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    const baseLogin = (acc.account_name || acc.external_account_id).split(' | ')[0];
    const { error: uErr } = await supabase
      .from('ad_accounts')
      .update({ account_name: `${baseLogin} | Цель: ${resolvedGoal}` })
      .eq('id', acc.id);

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
