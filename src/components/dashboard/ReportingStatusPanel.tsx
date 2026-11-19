"use client";

import React, { useState } from "react";
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  Code2,
} from "lucide-react";
import { StartupAnalyticsRecord } from "./types";
import { SUPABASE_SCHEMA_SQL } from "@/lib/supabase";

interface ReportingStatusPanelProps {
  startups: StartupAnalyticsRecord[];
  hasSupabase: boolean;
  onSyncAllApis: () => void;
  syncing: boolean;
}

export function ReportingStatusPanel({
  startups,
  hasSupabase,
  onSyncAllApis,
  syncing,
}: ReportingStatusPanelProps) {
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeCount = startups.filter((s) => s.apiStatus === "active").length;
  const pendingCount = startups.filter((s) => s.apiStatus === "pending").length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900">
            Инфраструктура данных: Supabase + Коннекторы
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setShowSchemaModal(!showSchemaModal)}
          className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-medium cursor-pointer"
        >
          <Code2 className="w-3.5 h-3.5" />
          {showSchemaModal ? "Скрыть SQL-схему" : "SQL-схема Supabase"}
        </button>
      </div>

      <div className="space-y-2.5 text-xs">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-slate-600 font-medium">База данных Supabase:</span>
          {hasSupabase ? (
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Подключена
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Ожидает ключей в .env
            </span>
          )}
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-slate-600 font-medium">API метрик стартапов:</span>
          <span className="font-semibold text-slate-800">
            <span className="text-emerald-700">{activeCount} активны</span> •{" "}
            <span className="text-amber-700">{pendingCount} в настройке</span>
          </span>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-slate-600 font-medium">Рекламные кабинеты:</span>
          <span className="text-slate-700 font-semibold">
            Директ • TG Ads • VK Ads
          </span>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
          <span className="text-slate-600 font-medium">Веб/Апп аналитика:</span>
          <span className="text-slate-700 font-semibold">
            Яндекс.Метрика • AppMetrica
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onSyncAllApis}
        disabled={syncing}
        className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing
          ? "Опрос эндпоинтов стартапов и рекламных API..."
          : "Запустить сбор метрик по API всех проектов"}
      </button>

      {showSchemaModal && (
        <div className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-indigo-300">
              Готовый SQL для Supabase SQL Editor:
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              {copied ? "Скопировано!" : "Копировать SQL"}
            </button>
          </div>
          <pre className="max-h-48 overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-300">
            {SUPABASE_SCHEMA_SQL}
          </pre>
        </div>
      )}
    </div>
  );
}
