'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/AppNav';
import { useUserRole } from '@/lib/useUserRole';
import { RefreshCw, Download, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { STARTUP_TAXONOMY } from '@/lib/startup-taxonomy';

interface MarketingRow {
  startup_id: string;
  date: string;
  source: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  installs: number;
  bot_starts: number;
  sessions: number;
}

export default function MarketingPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const userRole = useUserRole();

  const getYesterdayMsk = () => {
    const d = new Date(Date.now() + 3 * 3600 * 1000);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  const [dateFrom, setDateFrom] = useState('2026-11-05');
  const [dateTo, setDateTo] = useState(getYesterdayMsk);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [includeOrganic, setIncludeOrganic] = useState(true);
  const [sortBy, setSortBy] = useState<
    'spend' | 'impressions' | 'clicks' | 'ctr' | 'cpc' | 'conversions' | 'cpa' | 'installs' | 'cpi'
  >('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [startups, setStartups] = useState<{ id: string; name: string }[]>([]);
  const [metrics, setMetrics] = useState<MarketingRow[]>([]);
  const [accounts, setAccounts] = useState<{ startup_id: string; source: string; account_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingTg, setSyncingTg] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedChannels, setExpandedChannels] = useState<Record<string, boolean>>({});
  const [goalModal, setGoalModal] = useState<{ startupId: string; name: string; goal: string } | null>(null);
  const [vkModalOpen, setVkModalOpen] = useState(false);
  const [vkStartupId, setVkStartupId] = useState('');
  const [vkRows, setVkRows] = useState<
    { cabinet: string; date: string; spend: number; impressions: number; clicks: number; conversions: number }[]
  >([]);
  const [vkUploading, setVkUploading] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/marketing-metrics?date_from=${dateFrom}&date_to=${dateTo}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (res.ok) {
        setStartups(data.startups || []);
        setMetrics(data.metrics || []);
        setAccounts(data.accounts || []);
      } else {
        setBanner({ type: 'error', text: data.error || `Ошибка загрузки (HTTP ${res.status})` });
      }
    } catch {
      setBanner({ type: 'error', text: 'Не удалось загрузить данные из Supabase' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const handleYandexSync = async () => {
    setSyncing(true);
    setBanner(null);
    try {
      const res = await fetch('/api/admin/yandex-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      const data = await res.json();
      if (res.ok) {
        const s = data.stats;
        setBanner({
          type: 'ok',
          text: `Яндекс выгружен (строк: ${data.upserted_rows}). Директ: ${s.direct_ok} (ош: ${s.direct_err}), Метрика: ${s.metrika_ok} (ош: ${s.metrika_err}), AppMetrica: ${s.app_ok} (ош: ${s.app_err})`,
        });
        await loadData();
      } else {
        setBanner({ type: 'error', text: data.error || 'Ошибка выгрузки' });
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleAdstatSync = async () => {
    setSyncingTg(true);
    setBanner(null);
    try {
      const res = await fetch('/api/admin/adstat-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({
          type: 'ok',
          text: `TG Ads (Adstat) выгружен: получено ${data.fetched}, сматчено ${data.matched}, сохранено строк ${data.upserted_rows}`,
        });
        await loadData();
      } else {
        setBanner({ type: 'error', text: data.error || 'Ошибка выгрузки Adstat' });
      }
    } finally {
      setSyncingTg(false);
    }
  };

  const filteredMetrics =
    sourceFilter === 'all' ? metrics : metrics.filter((m) => m.source === sourceFilter);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const aggregated = startups
    .map((s) => {
      const rows = filteredMetrics.filter((m) => m.startup_id === s.id);
      const spend = rows.reduce((a, r) => a + Number(r.spend || 0), 0);
      const impressions = rows.reduce((a, r) => a + (r.impressions || 0), 0);
      const clicks = rows.reduce((a, r) => a + (r.clicks || 0), 0);
      const conversions = rows.reduce((a, r) => a + (r.conversions || 0), 0);
      const installs = rows.reduce(
        (a, r) =>
          a + (r.installs || 0) + (includeOrganic && r.source === 'appmetrica' ? r.sessions || 0 : 0),
        0
      );
      const sessions = rows.reduce((a, r) => a + (r.sessions || 0), 0);
      return {
        ...s,
        rows,
        spend,
        impressions,
        clicks,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : 0,
        conversions,
        cpa: conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0,
        installs,
        cpi: installs > 0 ? Number((spend / installs).toFixed(2)) : 0,
        sessions,
      };
    })
    .sort((a, b) => (sortDir === 'desc' ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]));

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
        role={userRole}
      />

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Маркетинг</h1>
              <p className="text-sm text-slate-500">
                Яндекс Директ, Метрика, AppMetrica, VK Ads и TG Ads
              </p>
            </div>
            {userRole === 'admin' && (
              <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => {
                  setVkRows([]);
                  setVkModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" />
                Загрузить VK Ads (CSV)
              </button>
              <button
                onClick={handleAdstatSync}
                disabled={syncingTg}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {syncingTg ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {syncingTg ? 'Выгружаем TG Ads...' : 'Выгрузить TG Ads (Adstat)'}
              </button>
              <button
                onClick={handleYandexSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {syncing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {syncing ? 'Выгружаем Яндекс...' : 'Выгрузить Яндекс (Директ + Метрика + AppMetrica)'}
              </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Дата с</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Дата по</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Источник</label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="all">Все источники</option>
                <option value="yandex_direct">Яндекс Директ</option>
                <option value="yandex_metrika">Яндекс Метрика</option>
                <option value="appmetrica">AppMetrica</option>
                <option value="vk_ads">VK Ads</option>
                <option value="tg_ads">TG Ads</option>
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={includeOrganic}
                onChange={(e) => setIncludeOrganic(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Учитывать органику (AppMetrica)
            </label>
          </div>

          {banner && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                banner.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {banner.text}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 uppercase text-slate-500">
                <tr>
                  <th className="w-8 px-2 py-3"></th>
                  <th className="px-4 py-3">Проект</th>
                  <th className="px-3 py-3">Форм-фактор</th>
                  <th onClick={() => handleSort('spend')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    Расход (₽) {sortBy === 'spend' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th onClick={() => handleSort('impressions')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    Показы {sortBy === 'impressions' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th onClick={() => handleSort('clicks')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    Клики {sortBy === 'clicks' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th onClick={() => handleSort('ctr')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    CTR % {sortBy === 'ctr' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th onClick={() => handleSort('cpc')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    CPC {sortBy === 'cpc' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th onClick={() => handleSort('conversions')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    Цел. действ. {sortBy === 'conversions' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th onClick={() => handleSort('cpa')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    CPA {sortBy === 'cpa' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th onClick={() => handleSort('installs')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    Установки {sortBy === 'installs' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                  <th onClick={() => handleSort('cpi')} className="cursor-pointer px-3 py-3 text-right hover:text-slate-900">
                    CPI {sortBy === 'cpi' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                      Загрузка...
                    </td>
                  </tr>
                ) : (
                  aggregated.map((r) => {
                    const isOpen = Boolean(expanded[r.id]);
                    return (
                      <React.Fragment key={r.id}>
                        <tr
                          onClick={() =>
                            setExpanded((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
                          }
                          className="cursor-pointer hover:bg-slate-50/70"
                        >
                          <td className="px-2 py-2.5 text-slate-400">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-sans">
                            <span className="font-semibold text-slate-900">{r.name}</span>
                            <span className="ml-1.5 font-mono text-slate-400">{r.id}</span>
                          </td>
                          <td className="px-3 py-2.5 font-sans text-[11px] text-slate-600">
                            {(STARTUP_TAXONOMY[r.id]?.multiFormats || []).join(', ') || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold">
                            {r.spend.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-3 py-2.5 text-right">{r.impressions.toLocaleString('ru-RU')}</td>
                          <td className="px-3 py-2.5 text-right">{r.clicks.toLocaleString('ru-RU')}</td>
                          <td className="px-3 py-2.5 text-right">{r.ctr}%</td>
                          <td className="px-3 py-2.5 text-right">{r.cpc}</td>
                          <td className="px-3 py-2.5 text-right">{r.conversions}</td>
                          <td className="px-3 py-2.5 text-right">{r.cpa}</td>
                          <td className="px-3 py-2.5 text-right">{r.installs}</td>
                          <td className="px-3 py-2.5 text-right">{r.cpi}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={12} className="px-8 py-3">
                              {r.rows.length === 0 ? (
                                <div className="py-2 text-xs text-slate-500">
                                  Нет данных за выбранный период.
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {Array.from(new Set(r.rows.map((d) => d.source)))
                                    .filter((src) => src !== 'yandex_metrika')
                                    .map((src) => {
                                    const chRows = r.rows.filter((d) => d.source === src);
                                    const chKey = `${r.id}__${src}`;
                                    const isChOpen = Boolean(expandedChannels[chKey]);
                                    const chSpend = chRows.reduce((a, d) => a + Number(d.spend || 0), 0);
                                    const chImp = chRows.reduce((a, d) => a + (d.impressions || 0), 0);
                                    const chClk = chRows.reduce((a, d) => a + (d.clicks || 0), 0);
                                    const chConv = chRows.reduce((a, d) => a + (d.conversions || 0), 0);
                                    const chInst = chRows.reduce(
                                      (a, d) =>
                                        a +
                                        (d.installs || 0) +
                                        (includeOrganic && d.source === 'appmetrica' ? d.sessions || 0 : 0),
                                      0
                                    );
                                    const chSess = chRows.reduce((a, d) => a + (d.sessions || 0), 0);

                                    return (
                                      <div key={src} className="rounded-lg border border-slate-200 bg-white">
                                        <div
                                          onClick={() =>
                                            setExpandedChannels((prev) => ({
                                              ...prev,
                                              [chKey]: !prev[chKey],
                                            }))
                                          }
                                          className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs hover:bg-slate-50"
                                        >
                                          <div className="flex items-center gap-2 font-semibold text-slate-800">
                                            {isChOpen ? (
                                              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                            ) : (
                                              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                            )}
                                            <span>{src}</span>
                                            <span className="font-normal text-slate-400">
                                              ({chRows.length} дн.)
                                            </span>
                                            {src === 'yandex_direct' && (
                                              <span className="inline-flex items-center gap-2 font-normal text-indigo-600 whitespace-normal">
                                                {accounts
                                                  .filter((a) => a.startup_id === r.id && a.source === 'yandex_direct')
                                                  .map((a) => a.account_name?.split(' | ')[1] || '')
                                                  .filter(Boolean)
                                                  .join(' · ')}
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    const current =
                                                      accounts
                                                        .find((a) => a.startup_id === r.id && a.source === 'yandex_direct')
                                                        ?.account_name?.split(' | Цель: ')[1] || '';
                                                    setGoalModal({ startupId: r.id, name: r.name, goal: current });
                                                  }}
                                                  className="shrink-0 whitespace-nowrap rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
                                                >
                                                  ✎ Цель
                                                </button>
                                              </span>
                                            )}
                                            {src === 'yandex_metrika' && (
                                              <span className="max-w-md truncate font-normal text-slate-500">
                                                {accounts
                                                  .filter((a) => a.startup_id === r.id && a.source === 'yandex_metrika')
                                                  .map((a) => a.account_name)
                                                  .filter(Boolean)
                                                  .join(' · ')}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex shrink-0 gap-4 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                                            {src === 'appmetrica' ? (
                                              <>
                                                <span>Органика: {chRows.reduce((a, d) => a + (d.sessions || 0), 0)}</span>
                                                <span>Прочие: {chRows.reduce((a, d) => a + (d.installs || 0), 0)}</span>
                                                <span className="font-semibold text-slate-900">Учтено: {chInst}</span>
                                              </>
                                            ) : (
                                              <>
                                                <span>Расход: {chSpend.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span>
                                                <span>Показы: {chImp.toLocaleString('ru-RU')}</span>
                                                <span>Клики: {chClk.toLocaleString('ru-RU')}</span>
                                                <span>Конв: {chConv}</span>
                                                <span>CR: {chClk > 0 ? ((chConv / chClk) * 100).toFixed(2) : '0.00'}%</span>
                                                <span>Уст: {chInst}</span>
                                              </>
                                            )}
                                          </div>
                                        </div>

                                        {isChOpen && (
                                          <div className="border-t border-slate-100 px-4 py-2">
                                            <table className="w-full text-left text-[11px]">
                                              <thead>
                                                {src === 'appmetrica' ? (
                                                  <tr className="border-b border-slate-200 text-slate-500">
                                                    <th className="py-1">Дата</th>
                                                    <th className="py-1 text-right">Органика</th>
                                                    <th className="py-1 text-right">Прочие источники</th>
                                                    <th className="py-1 text-right">Учтено (по фильтру)</th>
                                                  </tr>
                                                ) : (
                                                  <tr className="border-b border-slate-200 text-slate-500">
                                                    <th className="py-1">Дата</th>
                                                    <th className="py-1 text-right">Расход</th>
                                                    <th className="py-1 text-right">Показы</th>
                                                    <th className="py-1 text-right">Клики</th>
                                                    <th className="py-1 text-right">Конверсии</th>
                                                    <th className="py-1 text-right">CR %</th>
                                                    <th className="py-1 text-right">Установки</th>
                                                  </tr>
                                                )}
                                              </thead>
                                              <tbody className="divide-y divide-slate-100 font-mono">
                                                {chRows.map((d) =>
                                                  src === 'appmetrica' ? (
                                                    <tr key={d.date}>
                                                      <td className="py-1">{d.date}</td>
                                                      <td className="py-1 text-right">{d.sessions || 0}</td>
                                                      <td className="py-1 text-right">{d.installs || 0}</td>
                                                      <td className="py-1 text-right font-semibold">
                                                        {(d.installs || 0) + (includeOrganic ? d.sessions || 0 : 0)}
                                                      </td>
                                                    </tr>
                                                  ) : (
                                                    <tr key={d.date}>
                                                      <td className="py-1">{d.date}</td>
                                                      <td className="py-1 text-right">
                                                        {Number(d.spend).toLocaleString('ru-RU', { maximumFractionDigits: 0 })}
                                                      </td>
                                                      <td className="py-1 text-right">{d.impressions}</td>
                                                      <td className="py-1 text-right">{d.clicks}</td>
                                                      <td className="py-1 text-right">{d.conversions}</td>
                                                      <td className="py-1 text-right">
                                                        {d.clicks > 0 ? ((d.conversions / d.clicks) * 100).toFixed(2) : '0.00'}%
                                                      </td>
                                                      <td className="py-1 text-right">{d.installs || 0}</td>
                                                    </tr>
                                                  )
                                                )}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {goalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              Цель Директа: {goalModal.name} ({goalModal.startupId})
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Укажите ID или название цели, по которой работает кампания
            </p>
            <input
              type="text"
              value={goalModal.goal}
              onChange={(e) => setGoalModal({ ...goalModal, goal: e.target.value })}
              placeholder="Например: Регистрация или ID 123456"
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGoalModal(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={async () => {
                  await fetch('/api/admin/marketing-goal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      startup_id: goalModal.startupId,
                      goal: goalModal.goal,
                    }),
                  });
                  setGoalModal(null);
                  await loadData();
                }}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      {vkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Загрузка отчёта VK Ads (CSV)</h3>
            <p className="mt-1 text-xs text-slate-500">
              Выберите проект и загрузите стандартный CSV-файл из рекламного кабинета VK Ads.
            </p>
            <select
              value={vkStartupId}
              onChange={(e) => setVkStartupId(e.target.value)}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">-- Выберите проект --</option>
              {startups.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.name}
                </option>
              ))}
            </select>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const mapRows = (rawRows: Record<string, unknown>[]) =>
                  rawRows.map((r) => {
                    const spendKey = Object.keys(r).find((k) => k.trim().startsWith('Потрачено всего')) || 'spend';
                    const cleanNum = (v: unknown) => String(v ?? '0').replace(/\s+/g, '').replace(',', '.');
                    return {
                      cabinet: String(r.cabinet || r['Кабинет'] || r['Название каба'] || ''),
                      date: String(r.date || r['Дата'] || ''),
                      spend: parseFloat(cleanNum(r[spendKey] ?? r.spend)) || 0,
                      impressions: Math.round(parseFloat(cleanNum(r.impressions ?? r['Показы']))) || 0,
                      clicks: Math.round(parseFloat(cleanNum(r.clicks ?? r['Клики']))) || 0,
                      conversions: Math.round(parseFloat(cleanNum(r.conversions ?? r['Результат'] ?? r['Конверсии']))) || 0,
                    };
                  });

                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                  const buf = await file.arrayBuffer();
                  const wb = XLSX.read(buf, { type: 'array' });
                  const ws = wb.Sheets[wb.SheetNames[0]];
                  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: true });
                  setVkRows(mapRows(json));
                } else {
                  Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (res) => {
                      setVkRows(mapRows(res.data as Record<string, unknown>[]));
                    },
                  });
                }
              }}
              className="mt-4 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
            {vkRows.length > 0 && (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Распознано строк: <span className="font-semibold">{vkRows.length}</span>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVkModalOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={vkUploading || vkRows.length === 0 || !vkStartupId}
                onClick={async () => {
                  setVkUploading(true);
                  try {
                    const res = await fetch('/api/admin/vk-upload', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ startup_id: vkStartupId, rows: vkRows }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setVkModalOpen(false);
                      setBanner({
                        type: 'ok',
                        text: `VK Ads загружен: сматчено ${data.matched}, сохранено строк ${data.upserted_rows}${
                          data.unmatched?.length ? `. Не найдены кабы: ${data.unmatched.join(', ')}` : ''
                        }`,
                      });
                      await loadData();
                    } else {
                      setBanner({ type: 'error', text: data.error || 'Ошибка загрузки VK Ads' });
                    }
                  } finally {
                    setVkUploading(false);
                  }
                }}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {vkUploading ? 'Сохраняем...' : 'Сохранить в БД'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
