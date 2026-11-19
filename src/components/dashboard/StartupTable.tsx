"use client";

import React from "react";
import { CheckCircle2, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { StartupAnalyticsRecord } from "./types";

interface StartupTableProps {
  startups: StartupAnalyticsRecord[];
  onSelectStartup: (startup: StartupAnalyticsRecord) => void;
}

export function StartupTable({ startups, onSelectStartup }: StartupTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase text-slate-500">
              <th className="py-3 px-4">Проект / Стартап</th>
              <th className="py-3 px-3">Трекер</th>
              <th className="py-3 px-3">DAU (сутки)</th>
              <th className="py-3 px-3">Tool Calls (7д)</th>
              <th className="py-3 px-3">Рекламные каналы</th>
              <th className="py-3 px-3">Расход / Бюджет</th>
              <th className="py-3 px-3">Метрика (визиты / цели)</th>
              <th className="py-3 px-3">API статус</th>
              <th className="py-3 px-4 text-right">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {startups.map((s) => {
              const activeChannels = s.adChannels.filter((c) => c.connected);
              return (
                <tr
                  key={s.projectId}
                  onClick={() => onSelectStartup(s)}
                  className="hover:bg-indigo-50/40 cursor-pointer transition"
                >
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">
                      <span className="text-indigo-600">#{s.projectId}</span> {s.name}
                    </div>
                    <div className="text-[11px] text-slate-500">{s.productType}</div>
                  </td>

                  <td className="py-3 px-3 font-medium text-slate-700">
                    {s.trackerName}
                  </td>

                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900 text-sm">
                      {s.currentDau.toLocaleString("ru-RU")}
                    </div>
                    <div
                      className={`text-[10px] font-semibold ${
                        s.dauChangePct >= 0 ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {s.dauChangePct >= 0 ? `+${s.dauChangePct}%` : `${s.dauChangePct}%`} к прошлой нед.
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-900">
                      {s.toolCalls7d.toLocaleString("ru-RU")}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      LLM: {s.llmRequests7d.toLocaleString("ru-RU")} • Tool:{" "}
                      {s.toolRequests7d.toLocaleString("ru-RU")}
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1">
                      {activeChannels.length > 0 ? (
                        activeChannels.map((ch) => (
                          <span
                            key={ch.source}
                            className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium text-[11px]"
                          >
                            {ch.label}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400">Не подключены</span>
                      )}
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-900">
                      {s.budgetSpentRub.toLocaleString("ru-RU")} ₽
                    </div>
                    <div className="text-[10px] text-slate-400">
                      из {s.budgetTotalRub.toLocaleString("ru-RU")} ₽
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    {s.metrika.connected ? (
                      <div>
                        <div className="font-semibold text-slate-800">
                          {s.metrika.visits7d.toLocaleString("ru-RU")} виз. →{" "}
                          <span className="text-emerald-700">
                            {s.metrika.goalCompletions7d} цел.
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {s.metrika.platform} ({s.metrika.conversionRatePct}% CR)
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>

                  <td className="py-3 px-3">
                    {s.apiStatus === "active" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                        <CheckCircle2 className="w-3 h-3" /> Активен
                      </span>
                    ) : s.apiStatus === "pending" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold text-[11px]">
                        <Clock className="w-3 h-3" /> Ожидает токен
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-semibold text-[11px]">
                        <AlertCircle className="w-3 h-3" /> Ошибка
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold hover:underline">
                      Открыть <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </td>
                </tr>
              );
            })}
            {startups.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
                  Данные не загружены. Подключите базу данных Supabase или синхронизируйте список проектов.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
