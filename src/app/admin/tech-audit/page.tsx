'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/AppNav';
import { useUserRole } from '@/lib/useUserRole';
import { Search, RefreshCw, MessageSquare, Check, HelpCircle } from 'lucide-react';

type AuditStatus = '' | 'compliant' | 'partial' | 'non_compliant';

interface TechAuditRow {
  startup_id: string;
  name: string;
  is_active: boolean;
  dau_status: AuditStatus;
  dau_comment: string;
  tool_calls_status: AuditStatus;
  tool_calls_comment: string;
  updated_at: string | null;
}

const STATUS_OPTIONS: { value: AuditStatus; label: string }[] = [
  { value: '', label: '— Не проверено —' },
  { value: 'compliant', label: 'Соответствует' },
  { value: 'partial', label: 'Частично соответствует' },
  { value: 'non_compliant', label: 'Не соответствует' },
];

const STATUS_STYLES: Record<AuditStatus, string> = {
  '': 'bg-slate-100 text-slate-500 border-slate-200',
  compliant: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-800 border-amber-200',
  non_compliant: 'bg-rose-50 text-rose-700 border-rose-200',
};

const ROW_BG: Record<AuditStatus, string> = {
  '': '',
  compliant: 'bg-emerald-50/20',
  partial: 'bg-amber-50/30',
  non_compliant: 'bg-rose-50/30',
};

export default function TechAuditPage() {
  const router = useRouter();
  const userRole = useUserRole();
  const isAdmin = userRole === 'admin';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rows, setRows] = useState<TechAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/tech-audit', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && Array.isArray(data.rows)) {
        setRows(data.rows);
      } else {
        setErrorMsg(data.error || 'Ошибка загрузки');
      }
    } catch {
      setErrorMsg('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveRow = async (updated: TechAuditRow) => {
    if (!isAdmin) return;
    setSavingId(updated.startup_id);
    setErrorMsg(null);
    setRows((prev) => prev.map((r) => (r.startup_id === updated.startup_id ? updated : r)));
    try {
      const res = await fetch('/api/admin/tech-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startup_id: updated.startup_id,
          dau_status: updated.dau_status,
          dau_comment: updated.dau_comment,
          tool_calls_status: updated.tool_calls_status,
          tool_calls_comment: updated.tool_calls_comment,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Ошибка сохранения');
      } else {
        setSavedId(updated.startup_id);
        setTimeout(() => setSavedId((curr) => (curr === updated.startup_id ? null : curr)), 1500);
      }
    } catch {
      setErrorMsg('Ошибка сети при сохранении');
    } finally {
      setSavingId(null);
    }
  };

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.startup_id.toLowerCase().includes(search.toLowerCase())
  );

  const totalChecked = rows.filter((r) => r.dau_status !== '' || r.tool_calls_status !== '').length;
  const fullCompliant = rows.filter(
    (r) => r.dau_status === 'compliant' && r.tool_calls_status === 'compliant'
  ).length;
  const partialCompliant = rows.filter(
    (r) =>
      (r.dau_status === 'compliant' || r.tool_calls_status === 'compliant') &&
      !(r.dau_status === 'compliant' && r.tool_calls_status === 'compliant')
  ).length;
  const dauIssues = rows.filter(
    (r) => r.dau_status === 'partial' || r.dau_status === 'non_compliant'
  ).length;
  const tcIssues = rows.filter(
    (r) => r.tool_calls_status === 'partial' || r.tool_calls_status === 'non_compliant'
  ).length;

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <AppNav
        activeSection="dashboard"
        onSelectSection={(sec) => {
          if (sec === 'telegram_bot') router.push('/?tab=telegram_bot');
          else router.push('/');
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onLogout={() => router.push('/login')}
        role={userRole}
      />

      <div className="flex-1 p-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Тех аудит</h1>
              <p className="text-xs text-slate-500">
                Соответствие метрик DAU и Tool Calls техническим требованиям по каждому проекту
                {!isAdmin && ' (режим просмотра)'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по ID или названию..."
                  className="rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-slate-500">Всего проверено</div>
              <div className="mt-1 text-lg font-bold text-slate-900">
                {totalChecked} <span className="text-xs font-normal text-slate-400">/ {rows.length}</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-slate-500">Полностью соответствуют</div>
              <div className="mt-1 text-lg font-bold text-emerald-700">
                {fullCompliant} <span className="text-xs font-normal text-slate-400">/ {rows.length}</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-slate-500">Частично (≥1 зелёная)</div>
              <div className="mt-1 text-lg font-bold text-amber-700">{partialCompliant}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-slate-500">Проблем с DAU</div>
              <div className="mt-1 text-lg font-bold text-rose-700">{dauIssues}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="text-[11px] text-slate-500">Проблем с Tool Calls</div>
              <div className="mt-1 text-lg font-bold text-rose-700">{tcIssues}</div>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
              {errorMsg}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-400">Загрузка...</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500">
                    <th className="px-4 py-2.5 w-24">ID</th>
                    <th className="px-4 py-2.5 w-48">Название стартапа</th>
                    <th className="px-4 py-2.5">
                      <div className="inline-flex items-center gap-1.5">
                        <span>DAU соответствие требованиям</span>
                        <div className="group relative flex items-center">
                          <HelpCircle className="h-3.5 w-3.5 cursor-help text-slate-400 hover:text-indigo-600" />
                          <div className="pointer-events-none absolute left-0 top-5 z-30 hidden w-80 rounded-lg bg-slate-900 p-3 text-[11px] font-normal leading-relaxed text-white shadow-xl group-hover:block">
                            Оценка учитывает существенный риск завышения DAU относительно «NEW DAU definition». «Частично соответствует» ставят, если подтверждено применение правила расчёта, которое может заметно увеличить DAU. Настройка или режим без подтверждения применения, недосчёт и незначительные отклонения оценку не снижают. «Соответствует» ставят, если существенного подтверждённого риска не выявлено.
                          </div>
                        </div>
                      </div>
                    </th>
                    <th className="px-4 py-2.5">
                      <div className="inline-flex items-center gap-1.5">
                        <span>Tool calls соответствие требованиям</span>
                        <div className="group relative flex items-center">
                          <HelpCircle className="h-3.5 w-3.5 cursor-help text-slate-400 hover:text-indigo-600" />
                          <div className="pointer-events-none absolute right-0 top-5 z-30 hidden w-80 rounded-lg bg-slate-900 p-3 text-[11px] font-normal leading-relaxed text-white shadow-xl group-hover:block">
                            Оценку ставят относительно согласованной колонки «Tool calls definition». Частичное соответствие означает подтверждённый риск существенного завышения счётчика или показателя на DAU. Недосчёт, незначительные расхождения и неподтверждённые предположения оценку не снижают. В примечании перечислены засчитываемые лишние обращения и причина риска.
                          </div>
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => {
                    const rowBg =
                      r.dau_status === 'non_compliant' || r.tool_calls_status === 'non_compliant'
                        ? ROW_BG.non_compliant
                        : r.dau_status === 'partial' || r.tool_calls_status === 'partial'
                          ? ROW_BG.partial
                          : r.dau_status === 'compliant' && r.tool_calls_status === 'compliant'
                            ? ROW_BG.compliant
                            : '';

                    return (
                      <tr key={r.startup_id} className={`align-top hover:bg-slate-50/70 ${rowBg}`}>
                        <td className="px-4 py-3 font-mono text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <span>{r.startup_id}</span>
                            {savedId === r.startup_id && (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                            {savingId === r.startup_id && (
                              <RefreshCw className="h-3 w-3 animate-spin text-indigo-500" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>

                        {/* DAU column */}
                        <td className="px-4 py-3 space-y-1.5">
                          {isAdmin ? (
                            <>
                              <select
                                value={r.dau_status}
                                onChange={(e) =>
                                  saveRow({ ...r, dau_status: e.target.value as AuditStatus })
                                }
                                className={`w-full max-w-[220px] rounded-full border px-3 py-1 text-xs font-medium outline-none cursor-pointer ${STATUS_STYLES[r.dau_status]}`}
                              >
                                {STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <div className="group relative flex items-start gap-1.5">
                                <MessageSquare className="mt-1 h-3 w-3 shrink-0 text-slate-300" />
                                <textarea
                                  rows={2}
                                  value={r.dau_comment}
                                  onChange={(e) =>
                                    setRows((prev) =>
                                      prev.map((item) =>
                                        item.startup_id === r.startup_id
                                          ? { ...item, dau_comment: e.target.value }
                                          : item
                                      )
                                    )
                                  }
                                  onBlur={() => saveRow(r)}
                                  placeholder="Комментарий по DAU..."
                                  className="w-full resize-none rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[11px] leading-snug text-slate-600 placeholder:text-slate-300 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
                                />
                                {r.dau_comment && (
                                  <div className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden w-80 whitespace-pre-wrap rounded-lg bg-slate-900 p-2.5 text-[11px] leading-relaxed text-white shadow-xl group-hover:block">
                                    {r.dau_comment}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[r.dau_status]}`}
                              >
                                {STATUS_OPTIONS.find((o) => o.value === r.dau_status)?.label}
                              </span>
                              {r.dau_comment && (
                                <div className="text-[11px] text-slate-500">{r.dau_comment}</div>
                              )}
                            </>
                          )}
                        </td>

                        {/* Tool Calls column */}
                        <td className="px-4 py-3 space-y-1.5">
                          {isAdmin ? (
                            <>
                              <select
                                value={r.tool_calls_status}
                                onChange={(e) =>
                                  saveRow({ ...r, tool_calls_status: e.target.value as AuditStatus })
                                }
                                className={`w-full max-w-[220px] rounded-full border px-3 py-1 text-xs font-medium outline-none cursor-pointer ${STATUS_STYLES[r.tool_calls_status]}`}
                              >
                                {STATUS_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <div className="group relative flex items-start gap-1.5">
                                <MessageSquare className="mt-1 h-3 w-3 shrink-0 text-slate-300" />
                                <textarea
                                  rows={2}
                                  value={r.tool_calls_comment}
                                  onChange={(e) =>
                                    setRows((prev) =>
                                      prev.map((item) =>
                                        item.startup_id === r.startup_id
                                          ? { ...item, tool_calls_comment: e.target.value }
                                          : item
                                      )
                                    )
                                  }
                                  onBlur={() => saveRow(r)}
                                  placeholder="Комментарий по Tool Calls..."
                                  className="w-full resize-none rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[11px] leading-snug text-slate-600 placeholder:text-slate-300 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none"
                                />
                                {r.tool_calls_comment && (
                                  <div className="pointer-events-none absolute right-0 top-full z-30 mt-1 hidden w-80 whitespace-pre-wrap rounded-lg bg-slate-900 p-2.5 text-[11px] leading-relaxed text-white shadow-xl group-hover:block">
                                    {r.tool_calls_comment}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[r.tool_calls_status]}`}
                              >
                                {STATUS_OPTIONS.find((o) => o.value === r.tool_calls_status)?.label}
                              </span>
                              {r.tool_calls_comment && (
                                <div className="text-[11px] text-slate-500">{r.tool_calls_comment}</div>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
