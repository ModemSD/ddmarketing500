'use client';

import React, { useEffect, useState } from 'react';
import { HelpCircle, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import { STARTUP_TAXONOMY } from '@/lib/startup-taxonomy';

interface ProductDay {
  date: string;
  dau: number;
  llm_requests: number;
  tool_requests: number;
  new_users: number;
  total_users?: number;
}

interface StartupProduct {
  id: string;
  name: string;
  days: ProductDay[];
}

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

function InfoTip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center">
      <HelpCircle className="h-3.5 w-3.5 cursor-help text-slate-400 hover:text-slate-600" />
      <div className="pointer-events-none absolute left-0 top-5 z-30 hidden w-72 rounded-lg bg-slate-900 p-2.5 text-[11px] font-normal leading-relaxed text-white shadow-lg group-hover:block">
        {text}
      </div>
    </div>
  );
}

export function MarketingProductOverview({
  dateFrom: propDateFrom,
  dateTo: propDateTo,
}: {
  dateFrom?: string;
  dateTo?: string;
} = {}) {
  const getYesterdayMsk = () => {
    const d = new Date(Date.now() + 3 * 3600 * 1000);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  };

  const dateFrom = propDateFrom || '2026-11-05';
  const dateTo = propDateTo || getYesterdayMsk();
  const [prodStartups, setProdStartups] = useState<StartupProduct[]>([]);
  const [mktRows, setMktRows] = useState<MarketingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'spend' | 'cac' | 'new_users' | 'total_users' | 'dau' | 'avg_dau_7' | 'avg_dau_14' | 'max_dau' | 'depth' | 'cost_dau'>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showAllSpendBars, setShowAllSpendBars] = useState(false);
  const [taxonomyTab, setTaxonomyTab] = useState<'domain' | 'format' | 'hypothesis'>('domain');
  const [expandedTax, setExpandedTax] = useState<Record<string, boolean>>({});
  const [detailStartup, setDetailStartup] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/admin/product-metrics?date_from=${dateFrom}&date_to=${dateTo}`, { cache: 'no-store' }).then((r) =>
        r.json()
      ),
      fetch(`/api/admin/marketing-metrics?date_from=${dateFrom}&date_to=${dateTo}`, { cache: 'no-store' }).then((r) =>
        r.json()
      ),
    ])
      .then(([pData, mData]) => {
        if (cancelled) return;
        setProdStartups(pData.startups || []);
        setMktRows(mData.metrics || []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFrom, dateTo]);

  // 1. Воронка портфеля
  const totalImpressions = mktRows.reduce((a, r) => a + (r.impressions || 0), 0);
  const totalClicks = mktRows.reduce((a, r) => a + (r.clicks || 0), 0);
  const totalConversions = mktRows.reduce((a, r) => a + (r.conversions || 0), 0);
  const totalInstalls = mktRows.reduce(
    (a, r) => a + (r.installs || 0) + (r.source === 'appmetrica' ? r.sessions || 0 : 0),
    0
  );
  const totalPaidInstalls = mktRows.reduce((a, r) => a + (r.installs || 0), 0);
  const totalNewUsers = prodStartups.reduce(
    (a, s) => a + (s.days || []).reduce((dAcc, d) => dAcc + d.new_users, 0),
    0
  );
  const totalSpend = mktRows.reduce((a, r) => a + Number(r.spend || 0), 0);

  // 2. Срез по каналам
  const channels = ['yandex_direct', 'vk_ads', 'tg_ads'] as const;
  const channelLabels: Record<string, string> = {
    yandex_direct: 'Яндекс Директ',
    vk_ads: 'VK Ads',
    tg_ads: 'TG Ads (Adstat)',
  };

  const channelStats = channels.map((ch) => {
    const rows = mktRows.filter((r) => r.source === ch);
    const spend = rows.reduce((a, r) => a + Number(r.spend || 0), 0);
    const clicks = rows.reduce((a, r) => a + (r.clicks || 0), 0);
    const conv = rows.reduce((a, r) => a + (r.conversions || 0), 0);
    const inst = rows.reduce((a, r) => a + (r.installs || 0), 0);
    const botStarts = rows.reduce((a, r) => a + (r.bot_starts || 0), 0);
    const spendWithConv = rows.filter((r) => (r.conversions || 0) > 0).reduce((a, r) => a + Number(r.spend || 0), 0);
    const spendWithInstalls = rows.filter((r) => (r.installs || 0) > 0).reduce((a, r) => a + Number(r.spend || 0), 0);
    const spendWithBotStarts = rows.filter((r) => (r.bot_starts || 0) > 0).reduce((a, r) => a + Number(r.spend || 0), 0);
    return {
      source: ch,
      label: channelLabels[ch],
      spend,
      share: totalSpend > 0 ? Math.round((spend / totalSpend) * 100) : 0,
      clicks,
      cpc: clicks > 0 ? (spend / clicks).toFixed(2) : '0',
      conv,
      cpa: conv > 0 ? Math.round(spendWithConv / conv) : 0,
      inst,
      cpi: inst > 0 ? Math.round(spendWithInstalls / inst) : 0,
      botStarts,
      cpaTg: botStarts > 0 ? Math.round(spendWithBotStarts / botStarts) : 0,
    };
  });

  // 3. Динамика по дням: Расход vs Новые юзеры
  const dailyMap: Record<string, { date: string; spend: number; newUsers: number }> = {};
  for (const r of mktRows) {
    if (!dailyMap[r.date]) dailyMap[r.date] = { date: r.date, spend: 0, newUsers: 0 };
    dailyMap[r.date].spend += Number(r.spend || 0);
  }
  for (const s of prodStartups) {
    for (const d of s.days || []) {
      if (!dailyMap[d.date]) dailyMap[d.date] = { date: d.date, spend: 0, newUsers: 0 };
      dailyMap[d.date].newUsers += d.new_users;
    }
  }
  const dailySeries = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const maxSpendDay = Math.max(1, ...dailySeries.map((d) => d.spend));
  const maxNewDay = Math.max(1, ...dailySeries.map((d) => d.newUsers));

  // 4 & 5. Unit-экономика по каждому проекту
  const unitRows = prodStartups.map((s) => {
    const pDays = s.days || [];
    const sumDau = pDays.reduce((a, d) => a + d.dau, 0);
    const sumTc = pDays.reduce((a, d) => a + d.llm_requests + d.tool_requests, 0);
    const newUsers = pDays.reduce((a, d) => a + d.new_users, 0);

    const mForS = mktRows.filter((r) => r.startup_id === s.id);
    const spend = mForS.reduce((a, r) => a + Number(r.spend || 0), 0);
    const installs = mForS.reduce(
      (a, r) => a + (r.installs || 0) + (r.source === 'appmetrica' ? r.sessions || 0 : 0),
      0
    );

    const sortedDays = [...pDays].sort((a, b) => b.date.localeCompare(a.date));
    let growthPct = 0;
    if (sortedDays.length >= 6) {
      const r3 = sortedDays.slice(0, 3).reduce((a, d) => a + d.dau, 0) / 3;
      const p3 = sortedDays.slice(3, 6).reduce((a, d) => a + d.dau, 0) / 3;
      growthPct = p3 > 0 ? Math.round(((r3 - p3) / p3) * 100) : 0;
    }

    return {
      id: s.id,
      name: s.name,
      spend,
      newUsers,
      totalUsers: sortedDays[0]?.total_users || 0,
      cac: newUsers > 0 ? Math.round(spend / newUsers) : 0,
      installs,
      cpi: installs > 0 ? Math.round(spend / installs) : 0,
      sumDau,
      avgDau: pDays.length > 0 ? Math.round(sumDau / pDays.length) : 0,
      avgDau7: sortedDays.slice(0, 7).length > 0
        ? Math.round(sortedDays.slice(0, 7).reduce((a, d) => a + d.dau, 0) / sortedDays.slice(0, 7).length)
        : 0,
      avgDau14: sortedDays.slice(0, 14).length > 0
        ? Math.round(sortedDays.slice(0, 14).reduce((a, d) => a + d.dau, 0) / sortedDays.slice(0, 14).length)
        : 0,
      maxDau: pDays.length > 0 ? Math.max(...pDays.map((d) => d.dau)) : 0,
      depth: sumDau > 0 ? Number((sumTc / sumDau).toFixed(1)) : 0,
      costPerDau: sumDau > 0 ? Math.round(spend / sumDau) : 0,
      growthPct,
    };
  });

  // Матрица отбора кандидатов (есть расход, адекватный CAC > 0 и глубина >= 5)
  const candidates = unitRows
    .filter((r) => r.spend > 10000 && r.newUsers >= 100 && r.cac > 0 && r.depth >= 5)
    .sort((a, b) => a.cac - b.cac)
    .slice(0, 6);

  const sortedUnit = [...unitRows]
    .filter((r) => r.spend > 0 || r.sumDau > 0)
    .sort((a, b) => {
      const map: Record<typeof sortBy, number> = {
        spend: a.spend - b.spend,
        cac: a.cac - b.cac,
        new_users: a.newUsers - b.newUsers,
        total_users: a.totalUsers - b.totalUsers,
        dau: a.avgDau - b.avgDau,
        avg_dau_7: a.avgDau7 - b.avgDau7,
        avg_dau_14: a.avgDau14 - b.avgDau14,
        max_dau: a.maxDau - b.maxDau,
        depth: a.depth - b.depth,
        cost_dau: a.costPerDau - b.costPerDau,
      };
      return sortDir === 'asc' ? map[sortBy] : -map[sortBy];
    });

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  // Расход по проектам (горизонтальный stacked bar: Директ, VK, TG)
  const projectSpendBars = prodStartups
    .map((s) => {
      const mForS = mktRows.filter((r) => r.startup_id === s.id);
      const direct = mForS.filter((r) => r.source === 'yandex_direct').reduce((a, r) => a + Number(r.spend || 0), 0);
      const vk = mForS.filter((r) => r.source === 'vk_ads').reduce((a, r) => a + Number(r.spend || 0), 0);
      const tg = mForS.filter((r) => r.source === 'tg_ads').reduce((a, r) => a + Number(r.spend || 0), 0);
      const total = direct + vk + tg;
      return { id: s.id, name: s.name, direct, vk, tg, total };
    })
    .filter((p) => p.total > 0)
    .sort((a, b) => b.total - a.total);
  const maxProjectSpend = Math.max(1, ...projectSpendBars.map((p) => p.total));

  // Реклама по неделям (Пн–Вс)
  const getWeekKey = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay() || 7; // 1..7
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() - day + 1);
    return mon.toISOString().slice(0, 10);
  };
  const weekMap: Record<
    string,
    {
      weekStart: string;
      days: Set<string>;
      direct: number;
      vk: number;
      tg: number;
      spend: number;
      impressions: number;
      clicks: number;
    }
  > = {};
  for (const r of mktRows) {
    if (!['yandex_direct', 'vk_ads', 'tg_ads'].includes(r.source)) continue;
    const wk = getWeekKey(r.date);
    if (!weekMap[wk]) {
      weekMap[wk] = { weekStart: wk, days: new Set(), direct: 0, vk: 0, tg: 0, spend: 0, impressions: 0, clicks: 0 };
    }
    const w = weekMap[wk];
    w.days.add(r.date);
    const sp = Number(r.spend || 0);
    w.spend += sp;
    if (r.source === 'yandex_direct') w.direct += sp;
    if (r.source === 'vk_ads') w.vk += sp;
    if (r.source === 'tg_ads') w.tg += sp;
    w.impressions += r.impressions || 0;
    w.clicks += r.clicks || 0;
  }
  const weeklyStats = Object.values(weekMap)
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((w) => {
      const daysCount = Math.max(1, w.days.size);
      return {
        ...w,
        daysCount,
        spendPerDay: w.spend / daysCount,
        directPerDay: w.direct / daysCount,
        vkPerDay: w.vk / daysCount,
        tgPerDay: w.tg / daysCount,
        ctr: w.impressions > 0 ? ((w.clicks / w.impressions) * 100).toFixed(2) : '0.00',
        cpc: w.clicks > 0 ? (w.spend / w.clicks).toFixed(2) : '0.00',
      };
    });
  const maxWeekPerDay = Math.max(1, ...weeklyStats.map((w) => w.spendPerDay));

  return (
    <div className="space-y-5 border-t border-slate-200 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Сводка: Маркетинг + Продукт (Unit-экономика)</h2>
          <p className="text-xs text-slate-500">
            Сквозная аналитика от рекламных расходов до реальных пользователей в продукте
          </p>
        </div>
      </div>

      {/* 1. Воронка портфеля */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          Общая воронка портфеля
          <InfoTip text="Суммарная воронка по всем 40 проектам за выбранный период: Показы и Клики из рекламных систем → Конверсии/Установки → Реальные новые пользователи (New Users) из продуктовых API. Общий CAC = Весь расход / Все New Users." />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-[11px] text-slate-500">Расход</div>
            <div className="mt-1 text-lg font-bold text-slate-900">
              {loading ? '...' : `${Math.round(totalSpend).toLocaleString('ru-RU')} ₽`}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div>
              <div className="text-[11px] text-slate-500">Показы</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {loading ? '...' : totalImpressions.toLocaleString('ru-RU')}
              </div>
            </div>
            <ArrowRight className="hidden h-4 w-4 text-slate-300 sm:block" />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div>
              <div className="text-[11px] text-slate-500">
                Клики (CTR {totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : 0}%)
              </div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {loading ? '...' : totalClicks.toLocaleString('ru-RU')}
              </div>
            </div>
            <ArrowRight className="hidden h-4 w-4 text-slate-300 sm:block" />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div>
              <div className="text-[11px] text-slate-500">Конверсии / Уст.</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {loading ? '...' : `${totalConversions.toLocaleString('ru-RU')} / ${totalInstalls.toLocaleString('ru-RU')}`}
              </div>
              {!loading && (
                <div className="mt-0.5 text-[11px] text-slate-500">
                  Уст. без орг.: {totalPaidInstalls.toLocaleString('ru-RU')}
                </div>
              )}
            </div>
            <ArrowRight className="hidden h-4 w-4 text-slate-300 sm:block" />
          </div>
          <div className="rounded-lg bg-indigo-50 p-3">
            <div className="text-[11px] text-indigo-700">
              New Users (CAC {totalNewUsers > 0 ? Math.round(totalSpend / totalNewUsers) : 0} ₽)
            </div>
            <div className="mt-1 text-lg font-bold text-indigo-900">
              {loading ? '...' : totalNewUsers.toLocaleString('ru-RU')}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Срез по каналам + 3. Динамика Расход vs New Users */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
            Эффективность каналов
            <InfoTip text="Сравнение Яндекс Директа, VK Ads и TG Ads: доля бюджета, средний CPC (Расход/Клики), CPA (Расход/Конверсии), CPI (Расход/Установки) и CPA TG (Расход/Старты бота)." />
          </div>
          <div className="space-y-3">
            {channelStats.map((c) => (
              <div key={c.source} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-900">
                  <span>{c.label}</span>
                  <span>{Math.round(c.spend).toLocaleString('ru-RU')} ₽ ({c.share}%)</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-3 font-mono text-[11px] text-slate-600">
                  <span>CPC: {c.cpc} ₽</span>
                  <span>CPA: {c.cpa} ₽</span>
                  {c.inst > 0 && <span>CPI: {c.cpi} ₽</span>}
                  {c.botStarts > 0 && <span>CPA TG: {c.cpaTg} ₽</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              Динамика: Расход (₽) vs Новые юзеры
              <InfoTip text="Синие столбцы — суммарный рекламный расход за день по всем каналам. Зелёные столбцы — новые регистрации (New Users) в продуктах за этот же день." />
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Расход
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> New Users
              </span>
            </div>
          </div>
          <div className="flex h-40 items-end gap-1.5 pt-4">
            {dailySeries.map((d) => (
              <div key={d.date} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                <div className="pointer-events-none absolute -top-2 z-20 hidden -translate-y-full rounded bg-slate-900 px-2 py-1 text-[10px] text-white whitespace-nowrap group-hover:block">
                  {d.date}: {Math.round(d.spend).toLocaleString('ru-RU')} ₽ · {d.newUsers} юзеров
                </div>
                <div className="flex h-full w-full items-end gap-0.5">
                  <div
                    style={{ height: `${Math.max(3, Math.round((d.spend / maxSpendDay) * 100))}%` }}
                    className="flex-1 rounded-t bg-indigo-500/85"
                  />
                  <div
                    style={{ height: `${Math.max(3, Math.round((d.newUsers / maxNewDay) * 100))}%` }}
                    className="flex-1 rounded-t bg-emerald-500/85"
                  />
                </div>
                <span className="mt-1 text-[10px] text-slate-400">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Матрица отбора кандидатов */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          Кандидаты (низкий CAC + высокая глубина ИИ)
          <InfoTip text="Проекты с расходом > 10 000 ₽, минимум 100 новыми юзерами и глубиной использования ИИ (Tool Calls / DAU) >= 5, отсортированные по самому дешёвому CAC (Расход / New Users)." />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((c) => (
            <div key={c.id} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{c.name}</span>
                <span className="font-mono text-emerald-700 font-semibold">CAC: {c.cac} ₽</span>
              </div>
              <div className="mt-1 flex gap-3 text-[11px] text-slate-600">
                <span>Глубина: <b>{c.depth}</b></span>
                <span>New: <b>{c.newUsers}</b></span>
                <span>Рост DAU: <b>{c.growthPct > 0 ? `+${c.growthPct}%` : `${c.growthPct}%`}</b></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Расход по проектам (горизонтальный stacked bar) */}
      {projectSpendBars.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              Расход по проектам ({projectSpendBars.length})
              <InfoTip text="Распределение рекламного бюджета по каждому проекту с разбивкой по каналам: Директ (синий), VK Ads (оранжевый), Telegram Ads (зелёный)." />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Директ
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> VK Ads
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Telegram Ads
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            {(showAllSpendBars ? projectSpendBars : projectSpendBars.slice(0, 10)).map((p) => (
              <div
                key={p.id}
                className="group relative flex items-center gap-3 rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-slate-50"
              >
                <div className="w-40 shrink-0 truncate text-slate-700" title={`${p.id} ${p.name}`}>
                  <span className="font-mono text-slate-400">{p.id}</span> {p.name}
                </div>
                <div className="flex h-4 flex-1 overflow-hidden rounded bg-slate-100 transition-transform duration-200 group-hover:scale-y-110">
                  <div
                    style={{ width: `${(p.direct / maxProjectSpend) * 100}%` }}
                    className="h-full bg-blue-500 transition-opacity group-hover:opacity-95"
                  />
                  <div
                    style={{ width: `${(p.vk / maxProjectSpend) * 100}%` }}
                    className="h-full bg-orange-500 transition-opacity group-hover:opacity-95"
                  />
                  <div
                    style={{ width: `${(p.tg / maxProjectSpend) * 100}%` }}
                    className="h-full bg-emerald-500 transition-opacity group-hover:opacity-95"
                  />
                </div>
                <div className="w-24 shrink-0 text-right font-mono text-slate-600">
                  {Math.round(p.total).toLocaleString('ru-RU')} ₽
                </div>
                <div className="pointer-events-none absolute left-44 -top-8 z-20 hidden rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] text-white shadow-lg whitespace-nowrap group-hover:block">
                  Директ: {Math.round(p.direct).toLocaleString('ru-RU')} ₽
                  {p.vk > 0 ? ` · VK: ${Math.round(p.vk).toLocaleString('ru-RU')} ₽` : ''}
                  {p.tg > 0 ? ` · TG: ${Math.round(p.tg).toLocaleString('ru-RU')} ₽` : ''}
                </div>
              </div>
            ))}
          </div>
          {projectSpendBars.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAllSpendBars((v) => !v)}
              className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              {showAllSpendBars ? 'Свернуть до 10' : `Показать все (${projectSpendBars.length})`}
            </button>
          )}
        </div>
      )}

      {/* 6. Реклама по неделям */}
      {weeklyStats.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-5">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              Реклама по неделям
              <InfoTip text="Сводка по календарным неделям (Пн–Вс). Для корректного сравнения неполных недель смотрите колонку «Расход в день, ₽»." />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Неделя с</th>
                    <th className="py-2 text-right">Дней</th>
                    <th className="py-2 text-right">Расход, ₽</th>
                    <th className="py-2 text-right">Расход в день, ₽</th>
                    <th className="py-2 text-right">Показы</th>
                    <th className="py-2 text-right">Клики</th>
                    <th className="py-2 text-right">CTR, %</th>
                    <th className="py-2 text-right">CPC, ₽</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {weeklyStats.map((w) => (
                    <tr key={w.weekStart}>
                      <td className="py-2 font-sans font-medium text-slate-900">{w.weekStart}</td>
                      <td className="py-2 text-right">{w.daysCount}</td>
                      <td className="py-2 text-right font-semibold">
                        {Math.round(w.spend).toLocaleString('ru-RU')}
                      </td>
                      <td className="py-2 text-right text-indigo-600 font-semibold">
                        {Math.round(w.spendPerDay).toLocaleString('ru-RU')}
                      </td>
                      <td className="py-2 text-right">{w.impressions.toLocaleString('ru-RU')}</td>
                      <td className="py-2 text-right">{w.clicks.toLocaleString('ru-RU')}</td>
                      <td className="py-2 text-right">{w.ctr}%</td>
                      <td className="py-2 text-right">{w.cpc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold text-slate-700">Расход в день по неделям</div>
            <div className="space-y-2">
              {weeklyStats.map((w) => (
                <div
                  key={w.weekStart}
                  className="group relative flex items-center gap-3 rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-slate-50"
                >
                  <div className="w-28 shrink-0 text-slate-600">
                    {w.weekStart} ({w.daysCount} дн.)
                  </div>
                  <div className="flex h-5 flex-1 overflow-hidden rounded bg-slate-100 transition-transform duration-200 group-hover:scale-y-110">
                    <div
                      style={{ width: `${(w.directPerDay / maxWeekPerDay) * 100}%` }}
                      className="h-full bg-blue-500"
                    />
                    <div
                      style={{ width: `${(w.vkPerDay / maxWeekPerDay) * 100}%` }}
                      className="h-full bg-orange-500"
                    />
                    <div
                      style={{ width: `${(w.tgPerDay / maxWeekPerDay) * 100}%` }}
                      className="h-full bg-emerald-500"
                    />
                  </div>
                  <div className="w-28 shrink-0 text-right font-mono text-slate-700">
                    {Math.round(w.spendPerDay).toLocaleString('ru-RU')} ₽/день
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 7. Срез по Доменам и Форм-факторам (над Unit-экономикой, с раскрытием проектов) */}
      {(() => {
        const groupMap: Record<
          string,
          {
            label: string;
            projects: number;
            spend: number;
            newUsers: number;
            sumDau: number;
            sumDepth: number;
            items: typeof unitRows;
          }
        > = {};

        for (const r of unitRows) {
          const tax = STARTUP_TAXONOMY[r.id];
          if (!tax) continue;
          const keys =
            taxonomyTab === 'domain'
              ? [tax.domain]
              : taxonomyTab === 'format'
              ? (tax.multiFormats || tax.formats)
              : tax.hypothesis
              ? [tax.hypothesis]
              : [];
          for (const k of keys) {
            if (!groupMap[k]) {
              groupMap[k] = { label: k, projects: 0, spend: 0, newUsers: 0, sumDau: 0, sumDepth: 0, items: [] };
            }
            groupMap[k].projects += 1;
            groupMap[k].spend += r.spend;
            groupMap[k].newUsers += r.newUsers;
            groupMap[k].sumDau += r.sumDau;
            groupMap[k].sumDepth += r.depth;
            groupMap[k].items.push(r);
          }
        }

        const taxRows = Object.values(groupMap).sort((a, b) => b.spend - a.spend);

        return (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                Срез по типам стартапов и форм-факторам
                <InfoTip text="Кликните на любую строку, чтобы раскрыть все проекты внутри этого домена или форм-фактора и сравнить их между собой." />
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTaxonomyTab('domain')}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    taxonomyTab === 'domain' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  По Доменам
                </button>
                <button
                  type="button"
                  onClick={() => setTaxonomyTab('format')}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    taxonomyTab === 'format' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  По Форм-факторам
                </button>
                <button
                  type="button"
                  onClick={() => setTaxonomyTab('hypothesis')}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                    taxonomyTab === 'hypothesis' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  По Гипотезам
                </button>
              </div>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="w-6 py-2"></th>
                  <th className="py-2">
                    {taxonomyTab === 'domain'
                      ? 'Домен'
                      : taxonomyTab === 'format'
                      ? 'Форм-фактор'
                      : 'Гипотеза'}
                  </th>
                  <th className="py-2 text-right">Проектов</th>
                  <th className="py-2 text-right">Расход (₽)</th>
                  <th className="py-2 text-right">New Users</th>
                  <th className="py-2 text-right">Ср. CAC (₽)</th>
                  <th className="py-2 text-right">Ср. DAU</th>
                  <th className="py-2 text-right">Ср. Глубина ИИ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {taxRows.map((t) => {
                  const isOpen = Boolean(expandedTax[t.label]);
                  const sortedItems = [...t.items].sort((a, b) => b.spend - a.spend);
                  return (
                    <React.Fragment key={t.label}>
                      <tr
                        onClick={() => setExpandedTax((prev) => ({ ...prev, [t.label]: !prev[t.label] }))}
                        className="cursor-pointer hover:bg-slate-50/70"
                      >
                        <td className="py-2 text-slate-400">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </td>
                        <td className="py-2 font-sans font-medium text-slate-900">{t.label}</td>
                        <td className="py-2 text-right">{t.projects}</td>
                        <td className="py-2 text-right font-semibold">{Math.round(t.spend).toLocaleString('ru-RU')}</td>
                        <td className="py-2 text-right">{t.newUsers.toLocaleString('ru-RU')}</td>
                        <td className="py-2 text-right font-semibold text-indigo-600">
                          {t.newUsers > 0 ? Math.round(t.spend / t.newUsers) : '—'}
                        </td>
                        <td className="py-2 text-right">
                          {(t.items.length > 0
                            ? Math.round(t.items.reduce((a, it) => a + it.avgDau, 0) / t.items.length)
                            : 0
                          ).toLocaleString('ru-RU')}
                        </td>
                        <td className="py-2 text-right">{t.projects > 0 ? (t.sumDepth / t.projects).toFixed(1) : '—'}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={8} className="px-6 py-2">
                            <table className="w-full text-left text-[11px]">
                              <thead>
                                <tr className="border-b border-slate-200 text-slate-500">
                                  <th className="py-1">Проект</th>
                                  <th className="py-1 text-right">Расход (₽)</th>
                                  <th className="py-1 text-right">New Users</th>
                                  <th className="py-1 text-right">CAC (₽)</th>
                                  <th className="py-1 text-right">Ср. DAU</th>
                                  <th className="py-1 text-right">Ср. глубина ИИ</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200/60 font-mono">
                                {sortedItems.map((item) => (
                                  <tr
                                    key={item.id}
                                    onClick={() => setDetailStartup({ id: item.id, name: item.name })}
                                    className="cursor-pointer hover:bg-indigo-50/50"
                                  >
                                    <td className="py-1 font-sans text-slate-800">
                                      <span className="font-medium">{item.name}</span>{' '}
                                      <span className="font-mono text-slate-400">{item.id}</span>
                                    </td>
                                    <td className="py-1 text-right">{Math.round(item.spend).toLocaleString('ru-RU')}</td>
                                    <td className="py-1 text-right">{item.newUsers.toLocaleString('ru-RU')}</td>
                                    <td className="py-1 text-right text-indigo-600">{item.cac > 0 ? item.cac : '—'}</td>
                                    <td className="py-1 text-right">{item.avgDau.toLocaleString('ru-RU')}</td>
                                    <td className="py-1 text-right">{item.depth}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* 8. Сводная таблица Unit-экономики */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          Unit-экономика по всем проектам
          <InfoTip text="CAC = Расход / New Users (стоимость привлечения реального пользователя). Цена 1 DAU = Расход / Сумма DAU. Глубина = Tool Calls / DAU. Кликните по заголовку колонки для сортировки." />
        </div>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Проект</th>
              <th className="py-2">Форм-фактор</th>
              <th onClick={() => handleSort('spend')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                Расход (₽) {sortBy === 'spend' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th onClick={() => handleSort('new_users')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                New Users {sortBy === 'new_users' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th onClick={() => handleSort('total_users')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                Total Users {sortBy === 'total_users' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th onClick={() => handleSort('cac')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                CAC (₽) {sortBy === 'cac' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th className="py-2 text-right">CPI (₽)</th>
              <th onClick={() => handleSort('dau')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                Ср. DAU {sortBy === 'dau' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th onClick={() => handleSort('avg_dau_7')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                Ср. DAU 7д {sortBy === 'avg_dau_7' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th onClick={() => handleSort('avg_dau_14')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                Ср. DAU 14д {sortBy === 'avg_dau_14' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th onClick={() => handleSort('max_dau')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                Макс. DAU {sortBy === 'max_dau' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th onClick={() => handleSort('depth')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                Ср. глубина ИИ {sortBy === 'depth' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
              <th onClick={() => handleSort('cost_dau')} className="cursor-pointer py-2 text-right hover:text-slate-900">
                Цена 1 DAU {sortBy === 'cost_dau' ? (sortDir === 'desc' ? '↓' : '↑') : ''}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {sortedUnit.map((r) => (
              <tr
                key={r.id}
                onClick={() => setDetailStartup({ id: r.id, name: r.name })}
                className="cursor-pointer hover:bg-indigo-50/50"
              >
                <td className="py-2 font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-slate-900">{r.name}</span>
                    <span className="font-mono text-slate-400">{r.id}</span>
                  </div>
                </td>
                <td className="max-w-[170px] py-2 pr-3 font-sans text-[10px] leading-tight text-slate-500">
                  {(STARTUP_TAXONOMY[r.id]?.multiFormats || []).join(', ') || '—'}
                </td>
                <td className="py-2 text-right font-semibold">{Math.round(r.spend).toLocaleString('ru-RU')}</td>
                <td className="py-2 text-right">{r.newUsers.toLocaleString('ru-RU')}</td>
                <td className="py-2 text-right">{r.totalUsers.toLocaleString('ru-RU')}</td>
                <td className="py-2 text-right font-semibold text-indigo-600">{r.cac > 0 ? r.cac : '—'}</td>
                <td className="py-2 text-right">{r.cpi > 0 ? r.cpi : '—'}</td>
                <td className="py-2 text-right">
                  <div className="inline-flex items-center justify-end gap-1">
                    <span>{r.avgDau.toLocaleString('ru-RU')}</span>
                    {STARTUP_TAXONOMY[r.id]?.dauDefinition && (
                      <div
                        className="group relative inline-flex items-center font-sans"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <HelpCircle className="h-3.5 w-3.5 cursor-help text-slate-400 hover:text-indigo-600" />
                        <div className="pointer-events-none absolute right-0 top-5 z-30 hidden w-80 rounded-lg bg-slate-900 p-2.5 text-left text-[11px] font-normal leading-relaxed text-white shadow-xl group-hover:block">
                          <div className="mb-1 font-semibold text-indigo-300">Как считается DAU:</div>
                          {STARTUP_TAXONOMY[r.id].dauDefinition}
                        </div>
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-2 text-right">{r.avgDau7.toLocaleString('ru-RU')}</td>
                <td className="py-2 text-right">{r.avgDau14.toLocaleString('ru-RU')}</td>
                <td className="py-2 text-right">{r.maxDau.toLocaleString('ru-RU')}</td>
                <td className="py-2 text-right">{r.depth}</td>
                <td className="py-2 text-right">{r.costPerDau > 0 ? r.costPerDau : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-mono font-semibold text-slate-900">
              <td className="py-2.5 font-sans">Итого / Среднее ({sortedUnit.length})</td>
              <td className="py-2.5" />
              <td className="py-2.5 text-right">{Math.round(totalSpend).toLocaleString('ru-RU')}</td>
              <td className="py-2.5 text-right">{totalNewUsers.toLocaleString('ru-RU')}</td>
              <td className="py-2.5 text-right">{sortedUnit.reduce((a, r) => a + r.totalUsers, 0).toLocaleString('ru-RU')}</td>
              <td className="py-2.5 text-right text-indigo-600">
                {totalNewUsers > 0 ? Math.round(totalSpend / totalNewUsers) : '—'}
              </td>
              <td className="py-2.5 text-right">
                {totalInstalls > 0 ? Math.round(totalSpend / totalInstalls) : '—'}
              </td>
              <td className="py-2.5 text-right">
                {sortedUnit.length > 0 ? Math.round(sortedUnit.reduce((a, r) => a + r.avgDau, 0) / sortedUnit.length).toLocaleString('ru-RU') : '—'}
              </td>
              <td className="py-2.5 text-right">
                {sortedUnit.length > 0 ? Math.round(sortedUnit.reduce((a, r) => a + r.avgDau7, 0) / sortedUnit.length).toLocaleString('ru-RU') : '—'}
              </td>
              <td className="py-2.5 text-right">
                {sortedUnit.length > 0 ? Math.round(sortedUnit.reduce((a, r) => a + r.avgDau14, 0) / sortedUnit.length).toLocaleString('ru-RU') : '—'}
              </td>
              <td className="py-2.5 text-right">
                {sortedUnit.reduce((a, r) => a + r.maxDau, 0).toLocaleString('ru-RU')}
              </td>
              <td className="py-2.5 text-right">
                {sortedUnit.length > 0
                  ? (sortedUnit.reduce((a, r) => a + r.depth, 0) / sortedUnit.length).toFixed(1)
                  : '—'}
              </td>
              <td className="py-2.5 text-right">
                {sortedUnit.reduce((a, r) => a + r.sumDau, 0) > 0
                  ? Math.round(totalSpend / sortedUnit.reduce((a, r) => a + r.sumDau, 0))
                  : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {detailStartup && (() => {
        const pObj = prodStartups.find((s) => s.id === detailStartup.id);
        const mForS = mktRows.filter((r) => r.startup_id === detailStartup.id);
        const allDates = Array.from(
          new Set([
            ...(pObj?.days || []).map((d) => d.date),
            ...mForS.map((r) => r.date),
          ])
        ).sort((a, b) => b.localeCompare(a));

        return (
          <div
            onClick={() => setDetailStartup(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {detailStartup.name} ({detailStartup.id}) — динамика по дням
                  </h3>
                  <p className="text-xs text-slate-500">
                    Период: {dateFrom} — {dateTo}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailStartup(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Закрыть
                </button>
              </div>
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2">Дата</th>
                    <th className="py-2 text-right">Расход (₽)</th>
                    <th className="py-2 text-right">New Users</th>
                    <th className="py-2 text-right">Total Users</th>
                    <th className="py-2 text-right">CAC (₽)</th>
                    <th className="py-2 text-right">DAU</th>
                    <th className="py-2 text-right">Tool Calls</th>
                    <th className="py-2 text-right">Глубина</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {allDates.map((dt) => {
                    const p = pObj?.days.find((d) => d.date === dt);
                    const spend = mForS
                      .filter((r) => r.date === dt)
                      .reduce((a, r) => a + Number(r.spend || 0), 0);
                    const newU = p?.new_users || 0;
                    const dau = p?.dau || 0;
                    const tc = (p?.llm_requests || 0) + (p?.tool_requests || 0);
                    return (
                      <tr key={dt} className="hover:bg-slate-50">
                        <td className="py-1.5">{dt}</td>
                        <td className="py-1.5 text-right font-semibold">
                          {Math.round(spend).toLocaleString('ru-RU')}
                        </td>
                        <td className="py-1.5 text-right">{newU}</td>
                        <td className="py-1.5 text-right">{(p?.total_users || 0).toLocaleString('ru-RU')}</td>
                        <td className="py-1.5 text-right text-indigo-600">
                          {newU > 0 ? Math.round(spend / newU) : '—'}
                        </td>
                        <td className="py-1.5 text-right">{dau}</td>
                        <td className="py-1.5 text-right">{tc.toLocaleString('ru-RU')}</td>
                        <td className="py-1.5 text-right">
                          {dau > 0 ? (tc / dau).toFixed(1) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
