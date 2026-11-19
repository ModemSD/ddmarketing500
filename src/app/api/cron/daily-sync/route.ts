import { NextRequest, NextResponse } from 'next/server';

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

  const [product, yandex, vk, tg] = await Promise.allSettled([
    fetch(`${origin}/api/admin/product-metrics?date_from=${yesterday}&date_to=${yesterday}`).then((r) => r.json()),
    fetch(`${origin}/api/admin/yandex-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_from: yesterday, date_to: yesterday }),
    }).then((r) => r.json()),
    fetch(`${origin}/api/admin/vk-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_from: yesterday, date_to: yesterday }),
    }).then((r) => r.json()),
    fetch(`${origin}/api/admin/tg-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_from: yesterday, date_to: yesterday }),
    }).then((r) => r.json()),
  ]);

  return NextResponse.json({
    ok: true,
    date: yesterday,
    results: {
      product: product.status === 'fulfilled' ? product.value : { error: String(product.reason) },
      yandex: yandex.status === 'fulfilled' ? yandex.value : { error: String(yandex.reason) },
      vk: vk.status === 'fulfilled' ? vk.value : { error: String(vk.reason) },
      tg: tg.status === 'fulfilled' ? tg.value : { error: String(tg.reason) },
    },
  });
}
