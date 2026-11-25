'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/AppNav';
import { formatDateRu } from '@/lib/dateFormat';

interface CronLog {
  id: string;
  sync_date: string;
  status: string;
  results: Record<string, unknown>;
  created_at: string;
}

export default function AdminLogsPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logs, setLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/cron-logs', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setLogs(data.logs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      await fetch('/api/cron/daily-sync');
      await loadLogs();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <AppNav
        activeSection="dashboard"
        onSelectSection={(section) =>
          router.push(section === 'telegram_bot' ? '/?tab=telegram_bot' : '/')
        }
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        onLogout={() => router.push('/')}
      />
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Логи автосинхронизации</h1>
              <p className="text-xs text-slate-500">
                Ежедневная выгрузка за прошлый день (09:00 МСК): Продуктовые API, Яндекс, VK Ads и TG Ads
              </p>
            </div>
            <button
              type="button"
              disabled={running}
              onClick={handleRunNow}
              className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {running ? 'Синхронизация...' : 'Запустить сейчас'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Загрузка логов...</div>
            ) : logs.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Логов пока нет. Нажмите «Запустить сейчас» или дождитесь утреннего крона.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4">Время (МСК)</th>
                    <th className="py-2 pr-4">Дата данных</th>
                    <th className="py-2 pr-4">Статус</th>
                    <th className="py-2">Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 pr-4 font-mono text-slate-600 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
                      </td>
                      <td className="py-2.5 pr-4 font-mono whitespace-nowrap">{formatDateRu(log.sync_date)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            log.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {log.status === 'ok' ? 'Успешно' : 'Есть ошибки'}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-slate-700">
                        {(() => {
                          const r = log.results as any;
                          if (!r || typeof r !== 'object') {
                            return <span className="font-mono text-[11px] text-slate-500">{JSON.stringify(log.results)}</span>;
                          }
                          const prodErrors = Array.isArray(r.product?.results)
                            ? r.product.results.filter((x: any) => x.status === 'error')
                            : [];
                          return (
                            <div className="space-y-1">
                              {r.product && (
                                <div>
                                  <span className="font-medium text-slate-900">Продукт:</span>{' '}
                                  {r.product.ok} из {r.product.total} проектов загружено,{' '}
                                  <span className={r.product.error > 0 ? 'font-semibold text-rose-600' : 'text-emerald-600'}>
                                    {r.product.error} ошибок
                                  </span>
                                  {prodErrors.length > 0 && (
                                    <span className="ml-1.5 text-[11px] text-rose-600">
                                      ({prodErrors.map((e: any) => `${e.name}: ${e.error}`).join('; ')})
                                    </span>
                                  )}
                                </div>
                              )}
                              {r.yandex?.stats && (
                                <div>
                                  <span className="font-medium text-slate-900">Яндекс:</span>{' '}
                                  Директ {r.yandex.stats.direct_ok} ({r.yandex.stats.direct_err} ош.),{' '}
                                  Метрика {r.yandex.stats.metrika_ok} ({r.yandex.stats.metrika_err} ош.),{' '}
                                  AppMetrica {r.yandex.stats.app_ok} ({r.yandex.stats.app_err} ош.)
                                </div>
                              )}
                              {r.vk && (
                                <div>
                                  <span className="font-medium text-slate-900">VK Ads:</span>{' '}
                                  {r.vk.cabinets_ok} кабинетов загружено,{' '}
                                  <span className={r.vk.cabinets_err > 0 ? 'font-semibold text-rose-600' : 'text-emerald-600'}>
                                    {r.vk.cabinets_err} ошибок
                                  </span>
                                  {Array.isArray(r.vk.errors) && r.vk.errors.length > 0 && (
                                    <span className="ml-1.5 text-[11px] text-rose-600">
                                      ({r.vk.errors.map((e: any) => `${e.cabinet_id ? `каб. ${e.cabinet_id}` : e.token_prefix}: ${e.error}`).join('; ')})
                                    </span>
                                  )}
                                </div>
                              )}
                              {r.tg && (
                                <div>
                                  <span className="font-medium text-slate-900">TG Ads:</span>{' '}
                                  загружено {r.tg.matched ?? 0} из {r.tg.fetched ?? 0} (строк: {r.tg.upserted_rows ?? 0})
                                </div>
                              )}
                              <details className="pt-0.5">
                                <summary className="cursor-pointer text-[10px] text-slate-400 hover:text-slate-600">
                                  Показать сырой JSON
                                </summary>
                                <pre className="mt-1 max-w-2xl overflow-x-auto rounded bg-slate-50 p-2 font-mono text-[10px] text-slate-500">
                                  {JSON.stringify(log.results, null, 2)}
                                </pre>
                              </details>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
