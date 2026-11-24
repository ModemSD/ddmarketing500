import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { POST as syncProduct } from '@/app/api/admin/product-metrics/route';
import { POST as syncYandex } from '@/app/api/admin/yandex-sync/route';
import { POST as syncTg } from '@/app/api/admin/adstat-sync/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getYesterdayMsk(): string {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const yesterday = getYesterdayMsk();
  const origin = req.nextUrl.origin;

  const makePostReq = (path: string) =>
    new NextRequest(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_from: yesterday, date_to: yesterday }),
    });

  const [product, yandex, tg] = await Promise.allSettled([
    syncProduct(makePostReq('/api/admin/product-metrics')).then((r) => r.json()),
    syncYandex(makePostReq('/api/admin/yandex-sync')).then((r) => r.json()),
    syncTg(makePostReq('/api/admin/adstat-sync')).then((r) => r.json()),
  ]);

  const results = {
    product: product.status === 'fulfilled' ? product.value : { error: String(product.reason) },
    yandex: yandex.status === 'fulfilled' ? yandex.value : { error: String(yandex.reason) },
    tg: tg.status === 'fulfilled' ? tg.value : { error: String(tg.reason) },
  };

  const hasError = Object.values(results).some((r) => r && typeof r === 'object' && 'error' in r && r.error);
  try {
    const sb = getSupabaseAdmin();
    await sb.from('cron_logs').insert({
      sync_date: yesterday,
      status: hasError ? 'partial_error' : 'ok',
      results,
    });
  } catch {
    // ignore if cron_logs table is not created yet
  }

  return NextResponse.json({
    ok: true,
    date: yesterday,
    results,
  });
}
