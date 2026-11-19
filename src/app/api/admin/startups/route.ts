import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { encryptToken, decryptToken, maskToken } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

interface AdAccountInput {
  source: 'yandex_direct' | 'vk_ads' | 'tg_ads' | 'yandex_metrika' | 'appmetrica';
  external_account_id: string;
  account_name?: string;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data: startups, error } = await supabase
      .from('startups')
      .select('*, ad_accounts(*)')
      .order('id', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const sanitized = (startups || []).map((s) => {
      let tokenMasked = '';
      if (s.api_token_encrypted) {
        try {
          tokenMasked = maskToken(decryptToken(s.api_token_encrypted));
        } catch {
          tokenMasked = '••••';
        }
      }
      const { api_token_encrypted, ...rest } = s;
      return {
        ...rest,
        has_token: Boolean(api_token_encrypted),
        token_masked: tokenMasked,
      };
    });

    return NextResponse.json({ startups: sanitized });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim();

    if (!id || !name) {
      return NextResponse.json({ error: 'Поля ID и Название обязательны' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const apiUrl = body.api_url ? String(body.api_url).trim() : null;
    const plainToken = body.api_token ? String(body.api_token).trim() : null;

    const upsertData: Record<string, unknown> = {
      id,
      name,
      api_url: apiUrl,
      marketing_start_date: body.marketing_start_date || null,
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
      updated_at: new Date().toISOString(),
    };

    if (plainToken) {
      upsertData.api_token_encrypted = encryptToken(plainToken);
    }

    // Если URL и токен ещё не заданы — статус unconfigured
    if (!apiUrl) {
      upsertData.api_status = 'unconfigured';
    }

    const { error: upsertError } = await supabase
      .from('startups')
      .upsert(upsertData, { onConflict: 'id' });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Синхронизация кабинетов, если переданы
    if (Array.isArray(body.ad_accounts)) {
      const accounts: AdAccountInput[] = body.ad_accounts
        .filter((a: AdAccountInput) => a.source && a.external_account_id?.trim())
        .map((a: AdAccountInput) => ({
          source: a.source,
          external_account_id: a.external_account_id.trim(),
          account_name: a.account_name?.trim() || null,
        }));

      await supabase.from('ad_accounts').delete().eq('startup_id', id);

      if (accounts.length > 0) {
        const { error: accError } = await supabase.from('ad_accounts').insert(
          accounts.map((a) => ({
            startup_id: id,
            source: a.source,
            external_account_id: a.external_account_id,
            account_name: a.account_name,
          }))
        );
        if (accError) {
          return NextResponse.json({ error: accError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('startups').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
