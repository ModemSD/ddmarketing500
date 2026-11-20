'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export function useUserRole(): 'admin' | 'viewer' {
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabaseBrowser();
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch('/api/auth/role', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled && (json?.role === 'admin' || json?.role === 'viewer')) {
          setRole(json.role);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return role;
}
