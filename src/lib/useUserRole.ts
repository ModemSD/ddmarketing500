'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export function useUserRole(): 'admin' | 'viewer' {
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer');

  useEffect(() => {
    const cached = sessionStorage.getItem('d500_user_role');
    if (cached === 'admin' || cached === 'viewer') {
      setRole(cached);
    }
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
          sessionStorage.setItem('d500_user_role', json.role);
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
