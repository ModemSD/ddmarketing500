'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/AppNav';
import { useUserRole } from '@/lib/useUserRole';
import { Download, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

interface DayRow {
  date: string;
  dau: number;
  llm_requests: number;
  tool_requests: number;
  total_users: number;
  new_users: number;
  is_final: boolean;
}

interface StartupMetrics {
  id: string;
  name: string;
  api_url: string | null;
  api_status: string;
  days: DayRow[];
}

export default function ProductMetricsPage() {
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
  const [filterText, setFilterText] = useState('');

  const [startups, setStartups] = useState<StartupMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<
    'id' | 'days' | 'dau' | 'llm' | 'tools' | 'tool_calls' | 'new_users' | 'total_users'
  >('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [banner, setBanner] = useState<{
    type: 'ok' | 'error';
    text: string;
    errors?: { startup_id: string; name: string; error: string }[];
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });
      const res = await fetch(`/api/admin/product-metrics?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok) {
        setStartups(data.startups || []);
      } else {
        setBanner({ type: 'error', text: data.error || 'Ошибка загрузки' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const handleSync = async () => {
    setSyncing(true);
    setBanner(null);
    try {
      const res = await fetch('/api/admin/product-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_from: dateFrom,
          date_to: dateTo,
          startup_ids: selectedIds.length > 0 ? selectedIds : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const failed = (data.results || []).filter(
          (r: { status: string }) => r.status === 'error'
        );
        setBanner({
          type: data.error > 0 ? 'error' : 'ok',
          text: `Выгрузка завершена: успешно — ${data.ok}, ошибок — ${data.error} (из ${data.total} настроенных)`,
          errors: failed,
        });
        await loadData();
      } else {
        setBanner({ type: 'error', text: data.error || 'Ошибка синхронизации' });
      }
    } finally {
      setSyncing(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === startups.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(startups.map((s) => s.id));
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'id' ? 'asc' : 'desc');
    }
  };

  const filterTokens = filterText
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const filteredStartups = startups.filter((s) => {
    if (filterTokens.length === 0) return true;
    return filterTokens.some(
      (tok) => s.id.toLowerCase().includes(tok) || s.name.toLowerCase().includes(tok)
    );
  });

  const sortedStartups = [...filteredStartups].sort((a, b) => {
    const getVal = (s: StartupMetrics) => {
      if (sortBy === 'id') return s.id;
      if (sortBy === 'days') return s.days.length;
      if (sortBy === 'dau') return s.days.length > 0 ? Math.max(...s.days.map((d) => d.dau)) : 0;
      if (sortBy === 'llm') return s.days.reduce((acc, d) => acc + d.llm_requests, 0);
      if (sortBy === 'tools') return s.days.reduce((acc, d) => acc + d.tool_requests, 0);
      if (sortBy === 'tool_calls')
        return s.days.reduce((acc, d) => acc + d.llm_requests + d.tool_requests, 0);
      if (sortBy === 'total_users')
        return s.days.length > 0 ? [...s.days].sort((x, y) => y.date.localeCompare(x.date))[0].total_users : 0;
      return s.days.reduce((acc, d) => acc + d.new_users, 0);
    };
    const va = getVal(a);
    const vb = getVal(b);
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleExportCsv = () => {
    const headers = [
      'startup_id',
      'startup_name',
      'date',
      'dau',
      'llm_requests',
      'tool_requests',
      'tool_calls',
      'total_users',
      'new_users',
      'is_final',
    ];
    const lines = [headers.join(',')];
    for (const s of sortedStartups) {
      for (const d of s.days) {
        lines.push(
          [
            s.id,
            `"${s.name.replace(/"/g, '""')}"`,
            d.date,
            d.dau,
            d.llm_requests,
            d.tool_requests,
            d.llm_requests + d.tool_requests,
            d.total_users,
            d.new_users,
            d.is_final ? 'true' : 'false',
          ].join(',')
        );
      }
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product_metrics_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Количество дней в выбранном диапазоне
  const expectedDays = Math.max(
    1,
    Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24)) + 1
  );

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
              <h1 className="text-2xl font-bold tracking-tight">Продуктовые метрики</h1>
              <p className="text-sm text-slate-500">
                Выгрузка данных из API стартапов за период и проверка полноты по дням
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportCsv}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Скачать CSV
              </button>
              {userRole === 'admin' && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                >
                  {syncing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {syncing
                    ? 'Загружаем из API...'
                    : selectedIds.length > 0
                    ? `Загрузить выбранные (${selectedIds.length})`
                    : 'Загрузить данные из API'}
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
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
            <div className="min-w-[280px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Фильтр по ID или названию (через запятую или пробел)
              </label>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Например: 29008, 28431 или Спики"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          {banner && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                banner.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              <div>{banner.text}</div>
              {banner.errors && banner.errors.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {banner.errors.map((err) => (
                    <li key={err.startup_id}>
                      <span className="font-semibold">
                        {err.startup_id} ({err.name})
                      </span>
                      : {err.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Table with expandable days */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={startups.length > 0 && selectedIds.length === startups.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </th>
                  <th className="w-8 px-2 py-3"></th>
                  <th
                    onClick={() => handleSort('id')}
                    className="cursor-pointer px-4 py-3 hover:text-slate-900"
                  >
                    Проект {sortBy === 'id' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleSort('days')}
                    className="cursor-pointer px-4 py-3 hover:text-slate-900"
                  >
                    Загружено дней {sortBy === 'days' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleSort('dau')}
                    className="cursor-pointer px-4 py-3 text-right hover:text-slate-900"
                  >
                    Макс. DAU {sortBy === 'dau' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleSort('llm')}
                    className="cursor-pointer px-4 py-3 text-right hover:text-slate-900"
                  >
                    LLM Requests {sortBy === 'llm' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleSort('tools')}
                    className="cursor-pointer px-4 py-3 text-right hover:text-slate-900"
                  >
                    Tool Requests {sortBy === 'tools' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleSort('tool_calls')}
                    className="cursor-pointer px-4 py-3 text-right hover:text-slate-900"
                  >
                    Tool Calls {sortBy === 'tool_calls' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleSort('new_users')}
                    className="cursor-pointer px-4 py-3 text-right hover:text-slate-900"
                  >
                    Новые юзеры {sortBy === 'new_users' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleSort('total_users')}
                    className="cursor-pointer px-4 py-3 text-right hover:text-slate-900"
                  >
                    Total Users {sortBy === 'total_users' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      Загрузка...
                    </td>
                  </tr>
                ) : (
                  sortedStartups.map((s) => {
                    const isOpen = Boolean(expanded[s.id]);
                    const daysCount = s.days.length;
                    const maxDau = s.days.length > 0 ? Math.max(...s.days.map((d) => d.dau)) : 0;
                    const sumLlm = s.days.reduce((acc, d) => acc + d.llm_requests, 0);
                    const sumTools = s.days.reduce((acc, d) => acc + d.tool_requests, 0);
                    const sumToolCalls = sumLlm + sumTools;
                    const sumNew = s.days.reduce((acc, d) => acc + d.new_users, 0);
                    const totalUsers = s.days.length > 0
                      ? [...s.days].sort((a, b) => b.date.localeCompare(a.date))[0].total_users
                      : 0;

                    return (
                      <React.Fragment key={s.id}>
                        <tr
                          onClick={() => toggleExpand(s.id)}
                          className="cursor-pointer hover:bg-slate-50/80"
                        >
                          <td
                            className="px-4 py-3"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(s.id)}
                              onChange={() => toggleSelect(s.id)}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                          </td>
                          <td className="px-2 py-3 text-slate-400">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-900">{s.name}</span>
                            <span className="ml-2 font-mono text-xs text-slate-500">{s.id}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                daysCount === 0
                                  ? 'bg-slate-100 text-slate-600'
                                  : daysCount >= expectedDays
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {daysCount} / {expectedDays}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{maxDau.toLocaleString('ru-RU')}</td>
                          <td className="px-4 py-3 text-right font-mono">{sumLlm.toLocaleString('ru-RU')}</td>
                          <td className="px-4 py-3 text-right font-mono">{sumTools.toLocaleString('ru-RU')}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                            {sumToolCalls.toLocaleString('ru-RU')}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">{sumNew.toLocaleString('ru-RU')}</td>
                          <td className="px-4 py-3 text-right font-mono">{totalUsers.toLocaleString('ru-RU')}</td>
                        </tr>

                        {isOpen && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={10} className="px-8 py-3">
                              {s.days.length === 0 ? (
                                <div className="py-2 text-xs text-slate-500">
                                  Нет данных за выбранный период.
                                </div>
                              ) : (
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-500">
                                      <th className="py-1.5">Дата</th>
                                      <th className="py-1.5 text-right">DAU</th>
                                      <th className="py-1.5 text-right">LLM</th>
                                      <th className="py-1.5 text-right">Tools</th>
                                      <th className="py-1.5 text-right">Tool Calls</th>
                                      <th className="py-1.5 text-right">New Users</th>
                                      <th className="py-1.5 text-right">Total Users</th>
                                      <th className="py-1.5 text-right">Final</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200/70 font-mono">
                                    {s.days.map((d) => (
                                      <tr key={d.date}>
                                        <td className="py-1.5">{d.date}</td>
                                        <td className="py-1.5 text-right">{d.dau}</td>
                                        <td className="py-1.5 text-right">{d.llm_requests}</td>
                                        <td className="py-1.5 text-right">{d.tool_requests}</td>
                                        <td className="py-1.5 text-right font-semibold">
                                          {d.llm_requests + d.tool_requests}
                                        </td>
                                        <td className="py-1.5 text-right">{d.new_users}</td>
                                        <td className="py-1.5 text-right">{d.total_users}</td>
                                        <td className="py-1.5 text-right">
                                          {d.is_final ? '✓' : '…'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
    </div>
  );
}
