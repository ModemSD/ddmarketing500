import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { decryptToken } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

function getYesterdayMsk(): string {
  const now = new Date();
  const mskOffsetMs = 3 * 60 * 60 * 1000;
  const mskNow = new Date(now.getTime() + mskOffsetMs);
  mskNow.setUTCDate(mskNow.getUTCDate() - 1);
  return mskNow.toISOString().slice(0, 10);
}

interface CheckResult {
  startup_id: string;
  name: string;
  status: 'ok' | 'error' | 'unconfigured';
  http_code: number | null;
  duration_ms: number;
  error: string | null;
}

async function checkStartupApi(
  startup: {
    id: string;
    name: string;
    api_url: string | null;
    api_token_encrypted: string | null;
  },
  checkDate: string
): Promise<CheckResult> {
  if (!startup.api_url || !startup.api_token_encrypted) {
    return {
      startup_id: startup.id,
      name: startup.name,
      status: 'unconfigured',
      http_code: null,
      duration_ms: 0,
      error: 'Не указан URL или токен',
    };
  }

  const start = Date.now();
  let token = '';
  try {
    token = decryptToken(startup.api_token_encrypted);
  } catch {
    return {
      startup_id: startup.id,
      name: startup.name,
      status: 'error',
      http_code: null,
      duration_ms: Date.now() - start,
      error: 'Ошибка расшифровки токена',
    };
  }

  try {
    const url = new URL(startup.api_url);
    url.searchParams.set('date_from', checkDate);
    url.searchParams.set('date_to', checkDate);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

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
    const durationMs = Date.now() - start;

    if (!res.ok) {
      return {
        startup_id: startup.id,
        name: startup.name,
        status: 'error',
        http_code: res.status,
        duration_ms: durationMs,
        error: `HTTP ${res.status}`,
      };
    }

    const json = await res.json();
    if (!json || !Array.isArray(json.data)) {
      return {
        startup_id: startup.id,
        name: startup.name,
        status: 'error',
        http_code: res.status,
        duration_ms: durationMs,
        error: 'Неверный формат ответа: отсутствует массив data',
      };
    }

    if (json.data.length > 0) {
      const row = json.data[0];
      const requiredFields = ['date', 'dau', 'llm_requests', 'tool_requests', 'total_users'];
      const missing = requiredFields.filter((f) => row[f] === undefined);
      if (missing.length > 0) {
        return {
          startup_id: startup.id,
          name: startup.name,
          status: 'error',
          http_code: res.status,
          duration_ms: durationMs,
          error: `Отсутствуют поля: ${missing.join(', ')}`,
        };
      }
    }

    return {
      startup_id: startup.id,
      name: startup.name,
      status: 'ok',
      http_code: res.status,
      duration_ms: durationMs,
      error: null,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      startup_id: startup.id,
      name: startup.name,
      status: 'error',
      http_code: null,
      duration_ms: durationMs,
      error: isAbort ? 'Таймаут (>10 сек)' : err instanceof Error ? err.message : 'Ошибка сети',
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetId = body.startup_id ? String(body.startup_id) : null;

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('startups')
      .select('id, name, api_url, api_token_encrypted')
      .eq('is_active', true);

    if (targetId) {
      query = query.eq('id', targetId);
    }

    const { data: startups, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const checkDate = getYesterdayMsk();
    const results = await Promise.all(
      (startups || []).map((s) => checkStartupApi(s, checkDate))
    );

    const nowIso = new Date().toISOString();

    // Обновляем статусы в startups и пишем в sync_logs
    await Promise.all(
      results.map(async (r) => {
        await supabase
          .from('startups')
          .update({
            api_status: r.status,
            last_check_at: nowIso,
            last_error: r.error,
          })
          .eq('id', r.startup_id);

        if (r.status !== 'unconfigured') {
          await supabase.from('sync_logs').insert({
            startup_id: r.startup_id,
            source: 'product_api_health_check',
            status: r.status === 'ok' ? 'ok' : 'error',
            http_code: r.http_code,
            error_message: r.error,
            duration_ms: r.duration_ms,
          });
        }
      })
    );

    const summary = {
      total: results.length,
      ok: results.filter((r) => r.status === 'ok').length,
      error: results.filter((r) => r.status === 'error').length,
      unconfigured: results.filter((r) => r.status === 'unconfigured').length,
      check_date: checkDate,
      results,
    };

    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
