"use client";

import React, { useState } from "react";
import { StartupAnalyticsRecord } from "./types";
import { formatShortDateRu } from "@/lib/dateFormat";

interface MrrTrendChartProps {
  startups: StartupAnalyticsRecord[];
}

export function MrrTrendChart({ startups }: MrrTrendChartProps) {
  const [metricMode, setMetricMode] = useState<"dau" | "tool_calls" | "new_users">("dau");

  // Агрегируем точки по датам по всем выбранным стартапам
  const datesMap = new Map<
    string,
    { dau: number; tool_calls: number; new_users: number }
  >();

  for (const s of startups) {
    for (const pt of s.dailyHistory) {
      const prev = datesMap.get(pt.date) || { dau: 0, tool_calls: 0, new_users: 0 };
      datesMap.set(pt.date, {
        dau: prev.dau + pt.dau,
        tool_calls: prev.tool_calls + pt.tool_calls,
        new_users: prev.new_users + pt.new_users,
      });
    }
  }

  const series = Array.from(datesMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({
      date,
      value: vals[metricMode],
    }));

  const maxVal = Math.max(1, ...series.map((s) => s.value));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Динамика продуктовых метрик по дням (API стартапов)
          </h3>
          <p className="text-xs text-slate-500">
            Агрегированные суточные показатели (00:00–23:59 МСК) без учета ботов и тестовых аккаунтов
          </p>
        </div>

        <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setMetricMode("dau")}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              metricMode === "dau"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            DAU
          </button>
          <button
            type="button"
            onClick={() => setMetricMode("tool_calls")}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              metricMode === "tool_calls"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Tool Calls (LLM + Tools)
          </button>
          <button
            type="button"
            onClick={() => setMetricMode("new_users")}
            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer ${
              metricMode === "new_users"
                ? "bg-white text-indigo-600 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            New Users
          </button>
        </div>
      </div>

      {/* Столбчатый график по дням */}
      {series.length === 0 ? (
        <div className="h-44 flex items-center justify-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
          Нет накопленных исторических данных по дням.
        </div>
      ) : (
        <div className="h-44 flex items-end gap-2 pt-6 px-1 border-b border-slate-100">
          {series.map((pt) => {
            const heightPct = Math.max(8, Math.round((pt.value / maxVal) * 100));
            const shortDate = formatShortDateRu(pt.date);
            return (
              <div
                key={pt.date}
                className="flex-1 flex flex-col items-center gap-1.5 group"
              >
                <span className="text-[10px] font-semibold text-slate-600 opacity-85 group-hover:text-indigo-600">
                  {pt.value.toLocaleString("ru-RU")}
                </span>
                <div className="w-full bg-slate-100 rounded-t-lg h-28 flex items-end overflow-hidden">
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full bg-indigo-500 group-hover:bg-indigo-600 rounded-t-lg transition-all"
                  />
                </div>
                <span className="text-[10px] text-slate-400 font-mono">{shortDate}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
