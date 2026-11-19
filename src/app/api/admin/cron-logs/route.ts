import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from('cron_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json({ logs: [], error: error.message });
    }
    return NextResponse.json({ logs: data || [] });
  } catch (e: unknown) {
    return NextResponse.json({ logs: [], error: e instanceof Error ? e.message : String(e) });
  }
}
