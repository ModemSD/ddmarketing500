"use client";

import React from "react";
import { LayoutDashboard } from "lucide-react";

interface AnalyticsHubProps {
  adminPassword: string;
}

export function AnalyticsHub({ adminPassword: _adminPassword }: AnalyticsHubProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Dashboard
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Сводная аналитическая панель проектов
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-2xs flex flex-col items-center justify-center text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-[#5842F4] flex items-center justify-center">
          <LayoutDashboard className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-800">
          Дашборд готов к наполнению
        </h3>
        <p className="text-xs text-slate-400 max-w-md">
          Раздел подготовлен. Будем добавлять блоки, подключение Supabase и метрики пошагово по вашим задачам.
        </p>
      </div>
    </div>
  );
}
