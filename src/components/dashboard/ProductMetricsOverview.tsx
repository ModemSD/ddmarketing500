'use client';

import React, { useEffect, useState } from 'react';
import { formatDateRu, formatShortDateRu } from '@/lib/dateFormat';
import { Download, Users, Wallet, UserPlus, AlertTriangle, TrendingUp, Pencil, Check, X } from 'lucide-react';

interface DayRow {
  date: string;
  dau: number;
  llm_requests: number;
  tool_requests: number;
  total_users: number;
  new_users: number;
}

interface StartupMetrics {
  id: string;
  name: string;
  api_status: string;
  days: DayRow[];
}

export function ProductMetricsOverview({
  dateFrom: propDateFrom,
  dateTo: propDateTo,
  onDateFromChange,
  onDateToChange,
  onExportHtml,
}: {
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (v: string) => void;
  onDateToChange?: (v: string) => void;
  onExportHtml?: () => void;
} = {}) {
  const getYesterdayMsk = () => {
    const d = new Date(Date.now() + 3 * 3600 * 1000);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  const [localDateFrom, setLocalDateFrom] = useState('2026-11-05');
  const [localDateTo, setLocalDateTo] = useState(getYesterdayMsk);
  const dateFrom = propDateFrom ?? localDateFrom;
  const dateTo = propDateTo ?? localDateTo;
  const setDateFrom = onDateFromChange ?? setLocalDateFrom;
  const setDateTo = onDateToChange ?? setLocalDateTo;
  const [chartMetric, setChartMetric] = useState<'dau' | 'tool_calls' | 'new_users' | 'depth'>('dau');
  const [hiddenProjects, setHiddenProjects] = useState<Record<string, boolean>>({});
  const [topTab, setTopTab] = useState<'dau' | 'tool_calls' | 'depth' | 'new_users'>('dau');
  const [startups, setStartups] = useState<StartupMetrics[]>([]);
  const [totalSpend, setTotalSpend] = useState(0);
  const [totalBudgetRub, setTotalBudgetRub] = useState(0);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const handleSaveBudget = async () => {
    const num = Number(budgetInput.replace(/\s+/g, ''));
    if (!Number.isFinite(num) || num < 0) return;
    setSavingBudget(true);
    setBudgetError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_budget_rub: num }),
      });
      const data = await res.json();
      if (res.ok && typeof data.total_budget_rub === 'number') {
        setTotalBudgetRub(data.total_budget_rub);
        setEditingBudget(false);
      } else {
        setBudgetError(data?.error || 'Ошибка сохранения');
      }
    } catch {
      setBudgetError('Ошибка сети');
    } finally {
      setSavingBudget(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/product-metrics?date_from=${dateFrom}&date_to=${dateTo}`, {
        cache: 'no-store',
      }).then((r) => r.json()),
      fetch(`/api/admin/marketing-metrics?date_from=${dateFrom}&date_to=${dateTo}`, {
        cache: 'no-store',
      })
        .then((r) => r.json())
        .catch(() => ({ rows: [] })),
      fetch('/api/admin/settings', { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => ({ total_budget_rub: 0 })),
    ])
      .then(([prodData, mktData, settingsData]) => {
        if (cancelled) return;
        if (prodData?.startups) {
          setStartups(prodData.startups);
        }
        const mktRows: { spend?: number }[] = mktData?.metrics || [];
        const spendSum = mktRows.reduce((acc, r) => acc + Number(r.spend || 0), 0);
        setTotalSpend(spendSum);
        setTotalBudgetRub(Number(settingsData?.total_budget_rub || 0));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  // Считаем агрегаты по последнему дню (dateTo) и за весь период
  let lastDayDau = 0;
  let lastDayToolCalls = 0;
  let lastDayNewUsers = 0;
  let prevDayNewUsers = 0;
  const prevDateObj = new Date(dateTo + 'T00:00:00Z');
  prevDateObj.setUTCDate(prevDateObj.getUTCDate() - 1);
  const prevDateStr = Number.isNaN(prevDateObj.getTime())
    ? ''
    : prevDateObj.toISOString().slice(0, 10);
  let totalDau = 0;
  let totalToolCalls = 0;
  let totalNewUsers = 0;
  let activeWithData = 0;

  const alerts: { id: string; name: string; reason: string; lastDau: number; avgDau: number }[] = [];
  const ranked: {
    id: string;
    name: string;
    sumDau: number;
    maxDau: number;
    avgDau: number;
    sumToolCalls: number;
    depth: number;
    sumNew: number;
    bestStreak1000: number;
    currentStreak1000: number;
    daysOver1000: number;
    lastDau: number;
    dailyDelta: number;
  }[] = [];

  for (const s of startups) {
    if (!s.days || s.days.length === 0) continue;
    activeWithData++;

    const sumDau = s.days.reduce((acc, d) => acc + d.dau, 0);
    const maxDau = s.days.length > 0 ? Math.max(...s.days.map((d) => d.dau)) : 0;
    const sumToolCalls = s.days.reduce((acc, d) => acc + d.llm_requests + d.tool_requests, 0);
    const sumNew = s.days.reduce((acc, d) => acc + d.new_users, 0);
    const avgDau = Math.round(sumDau / s.days.length);

    totalDau += sumDau;
    totalToolCalls += sumToolCalls;
    totalNewUsers += sumNew;

    const lastDay = s.days.find((d) => d.date === dateTo);
    const prevDay = prevDateStr ? s.days.find((d) => d.date === prevDateStr) : undefined;
    if (prevDay) {
      prevDayNewUsers += prevDay.new_users;
    }
    if (lastDay) {
      lastDayDau += lastDay.dau;
      lastDayToolCalls += lastDay.llm_requests + lastDay.tool_requests;
      lastDayNewUsers += lastDay.new_users;

      if (lastDay.dau === 0 && avgDau > 5) {
        alerts.push({
          id: s.id,
          name: s.name,
          reason: 'DAU = 0',
          lastDau: lastDay.dau,
          avgDau,
        });
      } else if (avgDau > 10 && lastDay.dau < avgDau * 0.5) {
        alerts.push({
          id: s.id,
          name: s.name,
          reason: `Падение >50% (${lastDay.dau} vs ср. ${avgDau})`,
          lastDau: lastDay.dau,
          avgDau,
        });
      }
    }

    const sortedAsc = [...s.days].sort((a, b) => a.date.localeCompare(b.date));
    let curStreak = 0;
    let bestStreak = 0;
    let daysOver1000 = 0;
    for (const d of sortedAsc) {
      if (d.dau >= 1000) {
        daysOver1000 += 1;
        curStreak += 1;
        if (curStreak > bestStreak) bestStreak = curStreak;
      } else {
        curStreak = 0;
      }
    }

    const lastDauVal = sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1].dau : 0;
    const recentSlice = sortedAsc.slice(-3);
    const prevSlice = sortedAsc.slice(-6, -3);
    let dailyDelta = 0;
    if (recentSlice.length > 0 && prevSlice.length > 0) {
      const rAvg = recentSlice.reduce((a, d) => a + d.dau, 0) / recentSlice.length;
      const pAvg = prevSlice.reduce((a, d) => a + d.dau, 0) / prevSlice.length;
      dailyDelta = Math.round((rAvg - pAvg) / 3);
    }

    ranked.push({
      id: s.id,
      name: s.name,
      sumDau,
      maxDau,
      avgDau,
      sumToolCalls,
      depth: sumDau > 0 ? Number((sumToolCalls / sumDau).toFixed(1)) : 0,
      sumNew,
      bestStreak1000: Math.min(14, bestStreak),
      currentStreak1000: curStreak,
      daysOver1000,
      lastDau: lastDauVal,
      dailyDelta,
    });
  }

  const top10 = [...ranked]
    .sort((a, b) => {
      if (topTab === 'tool_calls') return b.sumToolCalls - a.sumToolCalls;
      if (topTab === 'depth') return b.depth - a.depth;
      if (topTab === 'new_users') return b.sumNew - a.sumNew;
      return b.sumDau - a.sumDau;
    })
    .slice(0, 10);

  // Палитра цветов для проектов
  const PALETTE = [
    '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4',
    '#8b5cf6', '#f97316', '#14b8a6', '#ef4444', '#3b82f6',
    '#84cc16', '#a855f7', '#eab308', '#0ea5e9', '#d946ef',
  ];

  const activeProjects = startups
    .filter((s) => s.days && s.days.length > 0)
    .map((s, idx) => ({
      id: s.id,
      name: s.name,
      color: PALETTE[idx % PALETTE.length],
    }));

  const toggleProject = (id: string) => {
    setHiddenProjects((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const focusSingleProject = (id: string) => {
    const visibleCount = activeProjects.filter((p) => !hiddenProjects[p.id]).length;
    if (visibleCount === 1 && !hiddenProjects[id]) {
      setHiddenProjects({});
    } else {
      const next: Record<string, boolean> = {};
      activeProjects.forEach((p) => {
        if (p.id !== id) next[p.id] = true;
      });
      setHiddenProjects(next);
    }
  };

  // Агрегация по дням для stacked-графика
  const dailyMap: Record<
    string,
    {
      date: string;
      total: number;
      sumDau: number;
      sumTc: number;
      byProject: { id: string; name: string; color: string; val: number }[];
    }
  > = {};

  for (const proj of activeProjects) {
    if (hiddenProjects[proj.id]) continue;
    const s = startups.find((st) => st.id === proj.id);
    for (const d of s?.days || []) {
      if (!dailyMap[d.date]) {
        dailyMap[d.date] = { date: d.date, total: 0, sumDau: 0, sumTc: 0, byProject: [] };
      }
      const tc = d.llm_requests + d.tool_requests;
      dailyMap[d.date].sumDau += d.dau;
      dailyMap[d.date].sumTc += tc;

      const val =
        chartMetric === 'dau'
          ? d.dau
          : chartMetric === 'tool_calls'
          ? tc
          : chartMetric === 'new_users'
          ? d.new_users
          : 0;
      if (val > 0) {
        dailyMap[d.date].total += val;
        dailyMap[d.date].byProject.push({ id: proj.id, name: proj.name, color: proj.color, val });
      }
    }
  }
  const dailySeries = Object.values(dailyMap)
    .map((item) => ({
      ...item,
      displayTotal:
        chartMetric === 'depth'
          ? item.sumDau > 0
            ? Number((item.sumTc / item.sumDau).toFixed(1))
            : 0
          : item.total,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const maxChartVal = Math.max(1, ...dailySeries.map((d) => d.displayTotal));

  // Растущие проекты (последние 3 дня vs предыдущие 3 дня)
  const momentumList = startups
    .filter((s) => s.days && s.days.length >= 6)
    .map((s) => {
      const sortedDays = [...s.days].sort((a, b) => b.date.localeCompare(a.date));
      const recent3 = sortedDays.slice(0, 3).reduce((acc, d) => acc + d.dau, 0) / 3;
      const prev3 = sortedDays.slice(3, 6).reduce((acc, d) => acc + d.dau, 0) / 3;
      const growthPct = prev3 > 0 ? Math.round(((recent3 - prev3) / prev3) * 100) : 0;
      return {
        id: s.id,
        name: s.name,
        recent3: Math.round(recent3),
        prev3: Math.round(prev3),
        growthPct,
      };
    })
    .filter((m) => m.recent3 >= 20 && m.growthPct > 0)
    .sort((a, b) => b.growthPct - a.growthPct)
    .slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Header + Period */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Продуктовые метрики</h2>
          <p className="text-xs text-slate-500">
            Сводка по выгруженным API стартапов за выбранный период
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {onExportHtml && (
            <button
              type="button"
              onClick={onExportHtml}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Скачать HTML
            </button>
          )}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
          />
          <span className="text-slate-400">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Потраченный бюджет</span>
            <Wallet className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {loading ? '...' : `${Math.round(totalSpend).toLocaleString('ru-RU')} ₽`}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {editingBudget ? (
              <div className="mt-1 flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveBudget();
                    if (e.key === 'Escape') setEditingBudget(false);
                  }}
                  placeholder="Весь бюджет, ₽"
                  autoFocus
                  className="w-28 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-800 outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  disabled={savingBudget}
                  onClick={handleSaveBudget}
                  title="Сохранить"
                  className="rounded bg-indigo-600 p-1 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingBudget(false);
                    setBudgetError(null);
                  }}
                  title="Отмена"
                  className="rounded border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span>
                  {totalBudgetRub > 0
                    ? `из ${totalBudgetRub.toLocaleString('ru-RU')} ₽ (${Math.round((totalSpend / totalBudgetRub) * 100)}%)`
                    : 'Весь бюджет не задан'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBudgetInput(totalBudgetRub > 0 ? String(totalBudgetRub) : '');
                    setEditingBudget(true);
                  }}
                  title="Задать общий бюджет"
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}
            {budgetError && (
              <div className="mt-1 text-[11px] text-rose-600">{budgetError}</div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Кол-во команд</span>
            <Users className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {loading ? '...' : startups.length.toLocaleString('ru-RU')}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            С данными: {activeWithData} · Алертов: {alerts.length}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Новые юзеры за все время</span>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {loading ? '...' : totalNewUsers.toLocaleString('ru-RU')}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Период: {formatDateRu(dateFrom)} — {formatDateRu(dateTo)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Новые юзеры за {formatDateRu(dateTo)}</span>
            <UserPlus className="h-4 w-4 text-sky-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {loading ? '...' : lastDayNewUsers.toLocaleString('ru-RU')}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {prevDayNewUsers > 0 ? (() => {
              const diffPct = Math.round(((lastDayNewUsers - prevDayNewUsers) / prevDayNewUsers) * 100);
              return (
                <span className={diffPct >= 0 ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                  {diffPct >= 0 ? '+' : ''}{diffPct}% к пред. дню ({prevDayNewUsers.toLocaleString('ru-RU')})
                </span>
              );
            })() : (
              'Нет данных за пред. день'
            )}
            {budgetError && (
              <div className="mt-1 text-[11px] text-rose-600">{budgetError}</div>
            )}
          </div>
        </div>
      </div>

      {/* Alerts + Top 10 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Red flags */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <div className="group relative flex items-center">
              <AlertTriangle className="h-4 w-4 cursor-help text-rose-500" />
              <div className="pointer-events-none absolute left-0 top-6 z-20 hidden w-72 rounded-lg border border-slate-200 bg-slate-900 p-3 text-xs font-normal text-white shadow-lg group-hover:block">
                <div className="font-semibold mb-1">Как считаются красные флаги:</div>
                Сравнивается последний день ({formatDateRu(dateTo)}) со средним DAU за период. Флаг ставится, если:
                <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-200">
                  <li>DAU = 0 (при среднем &gt; 5)</li>
                  <li>Падение DAU более чем на 50% от среднего (при среднем &gt; 10)</li>
                </ul>
              </div>
            </div>
            Красные флаги ({formatDateRu(dateTo)})
          </div>
          {alerts.length === 0 ? (
            <div className="text-xs text-slate-500">Резких падений не обнаружено.</div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-semibold text-rose-900">{a.name}</span>
                    <span className="ml-1.5 font-mono text-rose-600">{a.id}</span>
                  </div>
                  <span className="font-medium text-rose-700">{a.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 10 */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">
              Топ-10 проектов
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
              {(
                [
                  ['dau', 'DAU'],
                  ['depth', 'Глубина ИИ'],
                  ['tool_calls', 'Tool Calls'],
                  ['new_users', 'Новые'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTopTab(key)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    topTab === key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1.5">Проект</th>
                  <th className="py-1.5 text-right">Макс. DAU</th>
                  <th className="py-1.5 text-right">Ср. DAU/день</th>
                  <th className="py-1.5 text-right">Новые</th>
                  <th className="py-1.5 text-right">Глубина (TC/DAU)</th>
                  <th className="py-1.5 text-right">Tool Calls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {top10.map((r) => {
                  const isFocused =
                    !hiddenProjects[r.id] &&
                    activeProjects.filter((p) => !hiddenProjects[p.id]).length === 1;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => focusSingleProject(r.id)}
                      title="Кликните, чтобы показать динамику только этого проекта на графике"
                      className={`cursor-pointer transition-colors ${
                        isFocused ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-1.5">
                        <span className="font-medium text-slate-900">{r.name}</span>
                        <span className="ml-1.5 font-mono text-slate-400">{r.id}</span>
                      </td>
                      <td className="py-1.5 text-right font-mono">{r.maxDau.toLocaleString('ru-RU')}</td>
                      <td className="py-1.5 text-right font-mono">{r.avgDau.toLocaleString('ru-RU')}</td>
                      <td className="py-1.5 text-right font-mono">{r.sumNew.toLocaleString('ru-RU')}</td>
                      <td className="py-1.5 text-right font-mono font-semibold text-indigo-600">
                        {r.depth}
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {r.sumToolCalls.toLocaleString('ru-RU')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Daily Chart + Momentum */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Daily Bar Chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">
              Динамика по дням (все проекты)
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
              {(
                [
                  ['dau', 'DAU'],
                  ['tool_calls', 'Tool Calls'],
                  ['new_users', 'Новые юзеры'],
                  ['depth', 'Глубина (TC/DAU)'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setChartMetric(key)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    chartMetric === key
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {dailySeries.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Нет данных (или все проекты отключены в легенде)
            </div>
          ) : (
            <div className="flex gap-2 pt-4">
              <div className="flex h-48 flex-col justify-between pr-1 text-right font-mono text-[10px] text-slate-400">
                <span>{maxChartVal.toLocaleString('ru-RU')}</span>
                <span>{Math.round(maxChartVal / 2).toLocaleString('ru-RU')}</span>
                <span>0</span>
              </div>
              <div className="flex h-48 flex-1 items-end gap-1.5 border-b border-l border-slate-200 pl-2">
              {dailySeries.map((d) => {
                const heightPct = Math.max(4, Math.round((d.displayTotal / maxChartVal) * 100));
                const top3 = [...d.byProject].sort((a, b) => b.val - a.val).slice(0, 3);
                return (
                  <div
                    key={d.date}
                    className="group relative flex h-full flex-1 flex-col items-center justify-end"
                  >
                    <div className="pointer-events-none absolute -top-2 z-20 hidden -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] text-white shadow-lg whitespace-nowrap group-hover:block">
                      <div className="font-semibold">
                        {formatDateRu(d.date)}: {d.displayTotal.toLocaleString('ru-RU')}
                      </div>
                      {chartMetric !== 'depth' &&
                        top3.map((p) => (
                          <div key={p.id} className="flex items-center gap-1.5 text-slate-300">
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            {p.name}: {p.val.toLocaleString('ru-RU')}
                          </div>
                        ))}
                    </div>
                    {chartMetric === 'depth' ? (
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full rounded-t bg-indigo-500/85 transition-all group-hover:bg-indigo-600"
                      />
                    ) : (
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="flex w-full flex-col-reverse overflow-hidden rounded-t transition-all duration-300"
                      >
                        {d.byProject.map((p) => (
                          <div
                            key={p.id}
                            style={{
                              height: `${(p.val / d.total) * 100}%`,
                              backgroundColor: p.color,
                            }}
                            className="w-full transition-opacity group-hover:opacity-90"
                          />
                        ))}
                      </div>
                    )}
                    <span className="mt-1.5 text-[10px] text-slate-400">
                      {formatShortDateRu(d.date)}
                    </span>
                  </div>
                );
              })}
              </div>
            </div>
          )}

          {/* Interactive Legend */}
          {activeProjects.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>Проекты (кликните, чтобы скрыть/показать):</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHiddenProjects({})}
                    className="text-indigo-600 hover:underline"
                  >
                    Включить все
                  </button>
                  <button
                    onClick={() => {
                      const all: Record<string, boolean> = {};
                      activeProjects.forEach((p) => (all[p.id] = true));
                      setHiddenProjects(all);
                    }}
                    className="text-slate-500 hover:underline"
                  >
                    Скрыть все
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeProjects.map((p) => {
                  const isHidden = Boolean(hiddenProjects[p.id]);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleProject(p.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-all ${
                        isHidden
                          ? 'border-slate-200 bg-slate-50 text-slate-400 line-through'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: isHidden ? '#cbd5e1' : p.color }}
                      />
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Momentum: Growing projects */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-900">
            Растущие проекты (3д vs пред. 3д)
          </div>
          {momentumList.length === 0 ? (
            <div className="text-xs text-slate-500">Недостаточно данных (нужно от 6 дней).</div>
          ) : (
            <div className="space-y-2">
              {momentumList.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg bg-emerald-50/70 px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{m.name}</div>
                    <div className="text-[11px] text-slate-500">
                      Ср. DAU: {m.prev3} → {m.recent3}
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-mono font-semibold text-emerald-700">
                    +{m.growthPct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Пробили 1000 DAU + Зачётная серия */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Пробили 1 000 DAU ({ranked.filter((r) => r.maxDau >= 1000).length})
            </h3>
            <span className="text-[11px] text-slate-400">Макс. DAU за период</span>
          </div>
          {ranked.filter((r) => r.maxDau >= 1000).length === 0 ? (
            <div className="py-4 text-xs text-slate-400">Пока ни один проект не пробил 1 000 DAU за период.</div>
          ) : (
            <div className="space-y-2">
              {ranked
                .filter((r) => r.maxDau >= 1000)
                .sort((a, b) => b.maxDau - a.maxDau)
                .map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-slate-900">{r.name}</span>
                      <span className="ml-1.5 font-mono text-slate-400">{r.id}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-[11px] text-slate-500">{r.daysOver1000} дн. ≥1000</span>
                      <span className="font-semibold text-indigo-600">{r.maxDau.toLocaleString('ru-RU')}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Зачётная серия (DAU ≥ 1 000)</h3>
            <span className="text-[11px] text-slate-400">Лучшая серия подряд (0/14 → 14/14)</span>
          </div>
          {ranked.filter((r) => r.bestStreak1000 > 0).length === 0 ? (
            <div className="py-4 text-xs text-slate-400">Пока нет проектов с серией ≥ 1 дня.</div>
          ) : (
            <div className="space-y-2.5">
              {ranked
                .filter((r) => r.bestStreak1000 > 0)
                .sort((a, b) => b.bestStreak1000 - a.bestStreak1000 || b.currentStreak1000 - a.currentStreak1000)
                .map((r) => {
                  const pct = Math.round((r.bestStreak1000 / 14) * 100);
                  return (
                    <div key={r.id} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-slate-900">{r.name}</span>
                          <span className="ml-1.5 font-mono text-slate-400">{r.id}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          {r.currentStreak1000 > 0 && (
                            <span className="text-[10px] text-emerald-600">сейчас {r.currentStreak1000}</span>
                          )}
                          <span className="font-semibold text-slate-900">{r.bestStreak1000}/14</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full transition-all ${
                            r.bestStreak1000 >= 14 ? 'bg-emerald-500' : 'bg-indigo-500'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Предиктивная аналитика: удержание серии и кандидаты на 1000 DAU */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Прогноз по зачётной серии</h3>
            <span className="text-[11px] text-slate-400">Активные серии и риск срыва</span>
          </div>
          {ranked.filter((r) => r.currentStreak1000 > 0 && r.bestStreak1000 < 14).length === 0 ? (
            <div className="py-4 text-xs text-slate-400">Нет активных незавершённых серий.</div>
          ) : (
            <div className="space-y-2">
              {ranked
                .filter((r) => r.currentStreak1000 > 0 && r.bestStreak1000 < 14)
                .sort((a, b) => b.currentStreak1000 - a.currentStreak1000)
                .map((r) => {
                  const left = 14 - r.currentStreak1000;
                  const safe = r.dailyDelta >= 0 && r.lastDau >= 1050;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="font-medium text-slate-900">{r.name}</span>
                        <span className="ml-1.5 font-mono text-slate-400">{r.id}</span>
                        <div className="text-[11px] text-slate-500">
                          Осталось {left} дн. · темп {r.dailyDelta >= 0 ? `+${r.dailyDelta}` : r.dailyDelta}/день
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          safe ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {safe ? 'Закроет 14/14' : 'Есть риск'}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Скоро пробьют 1 000 DAU</h3>
            <span className="text-[11px] text-slate-400">По темпу роста за последние дни</span>
          </div>
          {ranked.filter((r) => r.lastDau < 1000 && r.dailyDelta > 0).length === 0 ? (
            <div className="py-4 text-xs text-slate-400">Пока нет растущих проектов ниже 1 000 DAU.</div>
          ) : (
            <div className="space-y-2">
              {ranked
                .filter((r) => r.lastDau < 1000 && r.dailyDelta > 0)
                .map((r) => ({ ...r, daysTo1000: Math.ceil((1000 - r.lastDau) / r.dailyDelta) }))
                .sort((a, b) => a.daysTo1000 - b.daysTo1000)
                .slice(0, 6)
                .map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-slate-900">{r.name}</span>
                      <span className="ml-1.5 font-mono text-slate-400">{r.id}</span>
                      <div className="text-[11px] text-slate-500">
                        Сейчас {r.lastDau.toLocaleString('ru-RU')} · +{r.dailyDelta}/день
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${
                        r.daysTo1000 <= 14 ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      ~{r.daysTo1000} дн.
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
