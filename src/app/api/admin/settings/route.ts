import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ total_budget_rub: 0 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('dashboard_settings')
      .select('key, value')
      .eq('key', 'total_budget_rub')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ total_budget_rub: 0, error: error.message });
    }

    const totalBudgetRub = data?.value ? Number(data.value) || 0 : 0;
    return NextResponse.json({ total_budget_rub: totalBudgetRub });
  } catch (err) {
    return NextResponse.json({
      total_budget_rub: 0,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const val = Number(body?.total_budget_rub);
    if (!Number.isFinite(val) || val < 0) {
      return NextResponse.json({ error: 'Некорректная сумма бюджета' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('dashboard_settings')
      .upsert(
        {
          key: 'total_budget_rub',
          value: String(Math.round(val)),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ total_budget_rub: Math.round(val) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
