'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppNav } from '@/components/AppNav';
import { STARTUP_TAXONOMY } from '@/lib/startup-taxonomy';
import {
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  Search,
  Activity,
} from 'lucide-react';

type SourceType = 'yandex_direct' | 'vk_ads' | 'tg_ads' | 'yandex_metrika' | 'appmetrica';

interface AdAccount {
  id?: string;
  source: SourceType;
  external_account_id: string;
  account_name?: string;
}

interface Startup {
  id: string;
  name: string;
  api_url: string | null;
  has_token: boolean;
  token_masked: string;
  api_status: 'ok' | 'error' | 'unconfigured';
  last_check_at: string | null;
  last_error: string | null;
  marketing_start_date: string | null;
  is_active: boolean;
  ad_accounts: AdAccount[];
}

const SOURCE_LABELS: Record<SourceType, string> = {
  yandex_direct: 'Яндекс Директ',
  vk_ads: 'VK Ads',
  tg_ads: 'TG Ads (adstat)',
  yandex_metrika: 'Яндекс Метрика',
  appmetrica: 'AppMetrica',
};

export default function AdminStartupsPage() {
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'viewer'>('viewer');
  useEffect(() => {
    fetch('/api/auth/role').then((r) => r.json()).then((d) => { if (d?.role) setUserRole(d.role); }).catch(() => {});
  }, []);
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'status'>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [banner, setBanner] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formApiUrl, setFormApiUrl] = useState('');
  const [formApiToken, setFormApiToken] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formAccounts, setFormAccounts] = useState<AdAccount[]>([]);
  const [saving, setSaving] = useState(false);

  const loadStartups = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/startups', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setStartups(data.startups || []);
      } else {
        setBanner({ type: 'error', text: data.error || 'Ошибка загрузки' });
      }
    } catch {
      setBanner({ type: 'error', text: 'Не удалось загрузить список стартапов' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStartups();
  }, []);

  const handleCheckAll = async () => {
    setCheckingAll(true);
    setBanner(null);
    try {
      const res = await fetch('/api/admin/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setBanner({
          type: data.error > 0 ? 'error' : 'ok',
          text: `Проверка за ${data.check_date}: OK — ${data.ok}, Ошибок — ${data.error}, Не настроено — ${data.unconfigured}`,
        });
        await loadStartups();
      } else {
        setBanner({ type: 'error', text: data.error || 'Ошибка проверки' });
      }
    } catch {
      setBanner({ type: 'error', text: 'Ошибка сети при проверке API' });
    } finally {
      setCheckingAll(false);
    }
  };

  const handleCheckOne = async (startupId: string) => {
    setCheckingId(startupId);
    try {
      const res = await fetch('/api/admin/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startup_id: startupId }),
      });
      if (res.ok) {
        await loadStartups();
      }
    } finally {
      setCheckingId(null);
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormId('');
    setFormName('');
    setFormApiUrl('');
    setFormApiToken('');
    setFormStartDate('');
    setFormAccounts([]);
    setIsModalOpen(true);
  };

  const openEditModal = (s: Startup) => {
    setEditingId(s.id);
    setFormId(s.id);
    setFormName(s.name);
    setFormApiUrl(s.api_url || '');
    setFormApiToken('');
    setFormStartDate(s.marketing_start_date || '');
    setFormAccounts(s.ad_accounts || []);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch('/api/admin/startups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: formId,
          name: formName,
          api_url: formApiUrl || null,
          api_token: formApiToken || null,
          marketing_start_date: formStartDate || null,
          ad_accounts: formAccounts,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsModalOpen(false);
        setBanner({ type: 'ok', text: `Стартап ${formId} (${formName}) сохранён` });
        await loadStartups();
      } else {
        setBanner({ type: 'error', text: data.error || 'Ошибка сохранения' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Удалить стартап ${id}? Все его метрики и кабинеты также будут удалены.`)) return;
    const res = await fetch(`/api/admin/startups?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await loadStartups();
    }
  };

  const addAccountRow = () => {
    setFormAccounts([
      ...formAccounts,
      { source: 'yandex_direct', external_account_id: '', account_name: '' },
    ]);
  };

  const updateAccountRow = (index: number, patch: Partial<AdAccount>) => {
    setFormAccounts(formAccounts.map((acc, i) => (i === index ? { ...acc, ...patch } : acc)));
  };

  const removeAccountRow = (index: number) => {
    setFormAccounts(formAccounts.filter((_, i) => i !== index));
  };

  const handleSort = (col: 'id' | 'status') => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const statusOrder: Record<Startup['api_status'], number> = {
    error: 0,
    unconfigured: 1,
    ok: 2,
  };

  const filtered = startups
    .filter(
      (s) =>
        s.id.toLowerCase().includes(search.toLowerCase()) ||
        s.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const va = sortBy === 'status' ? statusOrder[a.api_status] : a.id;
      const vb = sortBy === 'status' ? statusOrder[b.api_status] : b.id;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

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
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Стартапы, кабинеты и API</h1>
            <p className="text-sm text-slate-500">
              Управление справочником, привязкой рекламных кабинетов и проверкой эндпоинтов
            </p>
          </div>
          {userRole === 'admin' && (
            <div className="flex items-center gap-3">
            <button
              onClick={handleCheckAll}
              disabled={checkingAll}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <Activity className={`h-4 w-4 ${checkingAll ? 'animate-spin' : ''}`} />
              {checkingAll ? 'Проверяем...' : 'Проверить все API'}
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Добавить стартап
            </button>
          </div>
          )}
        </div>

        {/* Banner */}
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

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по ID или названию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-slate-500 focus:outline-none"
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th
                  onClick={() => handleSort('id')}
                  className="cursor-pointer px-4 py-3 hover:text-slate-900"
                >
                  ID / Название {sortBy === 'id' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="px-4 py-3">API Эндпоинт</th>
                <th
                  onClick={() => handleSort('status')}
                  className="cursor-pointer px-4 py-3 hover:text-slate-900"
                >
                  Статус API {sortBy === 'status' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th className="px-4 py-3">Кабинеты и счётчики</th>
                <th className="px-4 py-3 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Загрузка...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Стартапы не найдены. Нажмите «Добавить стартап».
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      <div className="font-mono text-xs text-slate-500">ID: {s.id}</div>
                      {STARTUP_TAXONOMY[s.id] && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                            {STARTUP_TAXONOMY[s.id].domain}
                          </span>
                          {STARTUP_TAXONOMY[s.id].formats.map((f) => (
                            <span
                              key={f}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.api_url ? (
                        <div className="max-w-xs truncate font-mono text-xs text-slate-700" title={s.api_url}>
                          {s.api_url}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">URL не задан</span>
                      )}
                      <div className="text-xs text-slate-400">
                        Токен: {s.has_token ? s.token_masked : 'не задан'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.api_status === 'ok' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> OK
                        </span>
                      )}
                      {s.api_status === 'error' && (
                        <div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                            <XCircle className="h-3.5 w-3.5" /> Ошибка
                          </span>
                          {s.last_error && (
                            <div className="mt-1 max-w-[200px] truncate text-xs text-rose-600" title={s.last_error}>
                              {s.last_error}
                            </div>
                          )}
                        </div>
                      )}
                      {s.api_status === 'unconfigured' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                          <AlertCircle className="h-3.5 w-3.5" /> Не настроен
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {(s.ad_accounts || []).length === 0 ? (
                          <span className="text-xs text-slate-400">Нет кабинетов</span>
                        ) : (
                          s.ad_accounts.map((acc, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                            >
                              {SOURCE_LABELS[acc.source]}: {acc.external_account_id}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleCheckOne(s.id)}
                          disabled={checkingId === s.id}
                          title="Проверить API"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <RefreshCw className={`h-4 w-4 ${checkingId === s.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => openEditModal(s)}
                          title="Редактировать"
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          title="Удалить"
                          className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editingId ? `Редактировать стартап ${editingId}` : 'Новый стартап'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    ID стартапа *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingId)}
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    placeholder="25555"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Название *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Енот"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  API Эндпоинт (GET /api/v1/metrics/daily)
                </label>
                <input
                  type="url"
                  value={formApiUrl}
                  onChange={(e) => setFormApiUrl(e.target.value)}
                  placeholder="https://enot.ai/api/v1/metrics/daily"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Bearer Токен {editingId ? '(оставьте пустым, чтобы не менять)' : ''}
                  </label>
                  <input
                    type="password"
                    value={formApiToken}
                    onChange={(e) => setFormApiToken(e.target.value)}
                    placeholder="Минимум 32 символа"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Дата старта маркетинга
                  </label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Ad accounts */}
              <div className="border-t border-slate-200 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Привязанные кабинеты и счётчики</span>
                  <button
                    type="button"
                    onClick={addAccountRow}
                    className="inline-flex items-center gap-1 rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  >
                    <Plus className="h-3.5 w-3.5" /> Добавить кабинет
                  </button>
                </div>

                <div className="space-y-2">
                  {formAccounts.map((acc, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={acc.source}
                        onChange={(e) =>
                          updateAccountRow(idx, { source: e.target.value as SourceType })
                        }
                        className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      >
                        {Object.entries(SOURCE_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="ID кабинета / счётчика"
                        value={acc.external_account_id}
                        onChange={(e) =>
                          updateAccountRow(idx, { external_account_id: e.target.value })
                        }
                        className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-sm"
                      />
                      <input
                        type="text"
                        placeholder="Название (опц.)"
                        value={acc.account_name || ''}
                        onChange={(e) => updateAccountRow(idx, { account_name: e.target.value })}
                        className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeAccountRow(idx)}
                        className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {formAccounts.length === 0 && (
                    <p className="text-xs text-slate-400">
                      Кабинеты не привязаны. Нажмите «Добавить кабинет», чтобы указать Директ, Метрику, AppMetrica, VK или TG.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
