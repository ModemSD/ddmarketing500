import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [{ data: startups, error: sErr }, { data: audits, error: aErr }] = await Promise.all([
      supabase.from('startups').select('id, name, is_active').order('id', { ascending: true }),
      supabase.from('tech_audit').select('*'),
    ]);

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

    const auditMap: Record<string, any> = {};
    for (const a of audits || []) {
      auditMap[a.startup_id] = a;
    }

    const rows = (startups || []).map((s) => {
      const a = auditMap[s.id];
      return {
        startup_id: s.id,
        name: s.name,
        is_active: s.is_active,
        dau_status: a?.dau_status || '',
        dau_comment: a?.dau_comment || '',
        tool_calls_status: a?.tool_calls_status || '',
        tool_calls_comment: a?.tool_calls_comment || '',
        updated_at: a?.updated_at || null,
      };
    });

    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const startup_id = String(body.startup_id || '').trim();
    if (!startup_id) {
      return NextResponse.json({ error: 'startup_id обязателен' }, { status: 400 });
    }

    const validStatuses = new Set(['', 'compliant', 'partial', 'non_compliant']);
    const dau_status = validStatuses.has(body.dau_status) ? body.dau_status : '';
    const tool_calls_status = validStatuses.has(body.tool_calls_status) ? body.tool_calls_status : '';
    const dau_comment = String(body.dau_comment || '');
    const tool_calls_comment = String(body.tool_calls_comment || '');

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('tech_audit')
      .upsert(
        {
          startup_id,
          dau_status,
          dau_comment,
          tool_calls_status,
          tool_calls_comment,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'startup_id' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
