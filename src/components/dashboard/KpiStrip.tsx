"use client";

import React from "react";
import { Users, Cpu, Wallet, Activity } from "lucide-react";
import { StartupAnalyticsRecord } from "./types";

interface KpiStripProps {
  startups: StartupAnalyticsRecord[];
}

export function KpiStrip({ startups }: KpiStripProps) {
  const totalDau = startups.reduce((sum, s) => sum + s.currentDau, 0);
  const totalToolCalls7d = startups.reduce((sum, s) => sum + s.toolCalls7d, 0);
  const totalLlm7d = startups.reduce((sum, s) => sum + s.llmRequests7d, 0);
  const totalToolReq7d = startups.reduce((sum, s) => sum + s.toolRequests7d, 0);
  const totalSpentRub = startups.reduce((sum, s) => sum + s.budgetSpentRub, 0);
  const totalBudgetRub = startups.reduce((sum, s) => sum + s.budgetTotalRub, 0);
  const activeApisCount = startups.filter((s) => s.apiStatus === "active").length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>Суммарный DAU (сутки МСК)</span>
          <Users className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {totalDau.toLocaleString("ru-RU")}
        </div>
        <div className="text-[11px] text-emerald-600 font-medium mt-1">
          Уникальные активные пользователи по проектам
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>Tool Calls за 7 дней (LLM + Tools)</span>
          <Cpu className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {totalToolCalls7d.toLocaleString("ru-RU")}
        </div>
        <div className="text-[11px] text-slate-500 mt-1">
          LLM: <b>{totalLlm7d.toLocaleString("ru-RU")}</b> • Tool req:{" "}
          <b>{totalToolReq7d.toLocaleString("ru-RU")}</b>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>Освоено маркетингового бюджета</span>
          <Wallet className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {totalSpentRub.toLocaleString("ru-RU")} ₽
        </div>
        <div className="text-[11px] text-slate-500 mt-1">
          Из {totalBudgetRub.toLocaleString("ru-RU")} ₽ (Директ, TG Ads, VK Ads)
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>Статус подключения API метрик</span>
          <Activity className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-2xl font-bold text-slate-900">
          {activeApisCount} из {startups.length}
        </div>
        <div className="text-[11px] text-slate-500 mt-1">
          Ежедневная авто-выгрузка по ТЗ (00:00–23:59 МСК)
        </div>
      </div>
    </div>
  );
}
