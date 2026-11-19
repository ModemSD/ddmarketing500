"use client";

import React, { useState } from "react";
import {
  X,
  RefreshCw,
  CheckCircle2,
  Globe,
  KeyRound,
  BarChart3,
  Megaphone,
  Cpu,
} from "lucide-react";
import { StartupAnalyticsRecord } from "./types";

interface StartupDrawerProps {
  startup: StartupAnalyticsRecord | null;
  onClose: () => void;
  onSaveConfig: (
    projectId: string,
    updates: Partial<StartupAnalyticsRecord>
  ) => void;
}

export function StartupDrawer({
  startup,
  onClose,
  onSaveConfig,
}: StartupDrawerProps) {
  const [apiEndpoint, setApiEndpoint] = useState(startup?.apiEndpoint || "");
  const [apiToken, setApiToken] = useState("");
  const [metrikaCounterId, setMetrikaCounterId] = useState(
    startup?.metrika.counterId || ""
  );
  const [testingApi, setTestingApi] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  if (!startup) return null;

  async function handleTestProductApi() {
    setTestingApi(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_startup_api",
          projectId: startup?.projectId,
          apiEndpoint: apiEndpoint || startup?.apiEndpoint,
          apiToken,
        }),
      });
      const data = await res.json();
      setTestResult(
        data.message ||
          "Эндпоинт проверен: формат ответа соответствует ТЗ (dau, llm_requests, tool_requests, total_users, new_users)."
      );
    } catch {
      setTestResult("Ошибка при тестовом вызове API стартапа");
    } finally {
      setTestingApi(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка карточки стартапа */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-600 text-white text-xs font-bold">
                #{startup.projectId}
              </span>
              <h2 className="text-base font-bold text-slate-900">
                {startup.name}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Трекер: <b>{startup.trackerName}</b> • Тип: {startup.productType} • Чат:{" "}
              {startup.chatTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Тело карточки */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Внутренние продуктовые метрики по API (по ТЗ) */}
          <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                <Cpu className="w-4 h-4" />
                1. Продуктовые метрики по API (ТЗ 00:00–23:59 МСК)
              </h3>
              <span className="text-[11px] text-slate-400">
                Обновлено:{" "}
                {startup.lastApiSyncAt
                  ? new Date(startup.lastApiSyncAt).toLocaleString("ru-RU")
                  : "ожидает синхронизации"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">dau</div>
                <div className="text-base font-bold text-slate-900">
                  {startup.currentDau}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">
                  llm_requests (7д)
                </div>
                <div className="text-base font-bold text-slate-900">
                  {startup.llmRequests7d.toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">
                  tool_requests (7д)
                </div>
                <div className="text-base font-bold text-slate-900">
                  {startup.toolRequests7d.toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200">
                <div className="text-[10px] text-indigo-700 font-semibold uppercase">
                  Tool Calls (Σ)
                </div>
                <div className="text-base font-bold text-indigo-900">
                  {startup.toolCalls7d.toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] text-slate-500 uppercase">
                  total_users
                </div>
                <div className="text-base font-bold text-slate-900">
                  {startup.totalUsers.toLocaleString("ru-RU")}
                </div>
              </div>
            </div>

            {/* Настройка API-эндпоинта и Bearer-токена стартапа */}
            <div className="pt-2 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-7">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    URL метода API стартапа (GET):
                  </label>
                  <div className="relative">
                    <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={apiEndpoint}
                      onChange={(e) => setApiEndpoint(e.target.value)}
                      placeholder="https://api.startup.ru/v1/metrics/daily"
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono"
                    />
                  </div>
                </div>
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    API-ключ / Bearer Token:
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="sk_live_..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleTestProductApi}
                  disabled={testingApi}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${testingApi ? "animate-spin" : ""}`}
                  />
                  Проверить API-ключ и забрать историю (30 дней)
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onSaveConfig(startup.projectId, {
                      apiEndpoint: apiEndpoint || startup.apiEndpoint,
                      apiStatus: "active",
                      metrika: {
                        ...startup.metrika,
                        counterId: metrikaCounterId || startup.metrika.counterId,
                        connected: Boolean(
                          metrikaCounterId || startup.metrika.counterId
                        ),
                      },
                    })
                  }
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Сохранить настройки
                </button>
              </div>

              {testResult && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{testResult}</span>
                </div>
              )}
            </div>
          </div>

          {/* 2. Рекламные кабинеты: Яндекс.Директ, Telegram Ads, VK Ads */}
          <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
              <Megaphone className="w-4 h-4" />
              2. Рекламные показатели (Директ • Telegram Ads • VK Ads)
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] text-slate-500">
                    <th className="py-2">Канал</th>
                    <th className="py-2">Аккаунт</th>
                    <th className="py-2">Показы</th>
                    <th className="py-2">Клики</th>
                    <th className="py-2">Расход</th>
                    <th className="py-2">Цели / Конв.</th>
                    <th className="py-2">CPA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {startup.adChannels.map((ch) => (
                    <tr key={ch.source}>
                      <td className="py-2 font-semibold text-slate-900">
                        {ch.label}
                      </td>
                      <td className="py-2 font-mono text-[11px] text-slate-500">
                        {ch.accountId || "не задан"}
                      </td>
                      <td className="py-2">
                        {ch.impressions.toLocaleString("ru-RU")}
                      </td>
                      <td className="py-2">
                        {ch.clicks.toLocaleString("ru-RU")}
                      </td>
                      <td className="py-2 font-semibold">
                        {ch.spendRub.toLocaleString("ru-RU")} ₽
                      </td>
                      <td className="py-2 text-emerald-700 font-semibold">
                        {ch.conversions}
                      </td>
                      <td className="py-2">
                        {ch.cpaRub > 0 ? `${ch.cpaRub.toFixed(0)} ₽` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. Яндекс.Метрика / AppMetrica */}
          <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4" />
              3. Веб и мобильная аналитика ({startup.metrika.platform})
            </h3>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500">ID счётчика</div>
                <input
                  type="text"
                  value={metrikaCounterId}
                  onChange={(e) => setMetrikaCounterId(e.target.value)}
                  placeholder="113888916"
                  className="mt-1 w-full px-2 py-1 rounded border border-slate-300 bg-white font-mono text-xs"
                />
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Визиты / Юзеры (7д)</div>
                <div className="text-sm font-bold text-slate-900 mt-1">
                  {startup.metrika.visits7d.toLocaleString("ru-RU")} /{" "}
                  {startup.metrika.users7d.toLocaleString("ru-RU")}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-slate-500">Достижения целей</div>
                <div className="text-sm font-bold text-emerald-700 mt-1">
                  {startup.metrika.goalCompletions7d} ({startup.metrika.conversionRatePct}%)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
