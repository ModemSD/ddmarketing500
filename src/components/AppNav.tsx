"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Send,
  LayoutDashboard,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Database,
  BarChart3,
  Megaphone,
} from "lucide-react";

export type SidebarTabId = "dashboard" | "telegram_bot";

interface SidebarItem {
  id: SidebarTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "telegram_bot",
    label: "Telegram Bot",
    icon: Send,
  },
];

interface AppNavProps {
  activeSection: SidebarTabId;
  onSelectSection: (section: SidebarTabId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onLogout: () => void;
  feedCount?: number;
  role?: "admin" | "viewer";
}

export function AppNav({
  activeSection,
  onSelectSection,
  collapsed,
  onToggleCollapse,
  onLogout,
  feedCount = 0,
  role = "admin",
}: AppNavProps) {
  const pathname = usePathname();
  const isStartupsPage = pathname?.startsWith("/admin/startups");
  const isProductMetricsPage = pathname?.startsWith("/admin/product-metrics");
  const isMarketingPage = pathname?.startsWith("/admin/marketing");
  const isSubPage = isStartupsPage || isProductMetricsPage || isMarketingPage;

  return (
    <aside
      className={`bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 transition-all duration-200 select-none h-screen sticky top-0 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Верхняя часть: DUSRUPT + Список вкладок */}
      <div>
        <div className="h-16 px-5 border-b border-slate-100 flex items-center">
          <span className="font-extrabold text-sm tracking-tight text-slate-900">
            {collapsed ? "D" : "DUSRUPT"}
          </span>
        </div>

        {/* Меню разделов: только Dashboard и Telegram Bot */}
        <nav className="p-3 space-y-1">
          {SIDEBAR_ITEMS.filter((item) => role === "admin" || item.id === "dashboard").map((item) => {
            const Icon = item.icon;
            const isActive = !isSubPage && activeSection === item.id;

            return (
              <div key={item.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => onSelectSection(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 font-semibold"
                      : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? "text-indigo-600" : "text-slate-400"
                      }`}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </div>

                  {!collapsed && item.id === "telegram_bot" && feedCount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md ${
                        isActive
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-indigo-50 text-indigo-600"
                      }`}
                    >
                      {feedCount}
                    </span>
                  )}
                </button>

                {!collapsed && item.id === "dashboard" && role === "admin" && (
                  <div className="pl-6 space-y-0.5">
                    <Link
                      href="/admin/startups"
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-colors ${
                        isStartupsPage
                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                          : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Database
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isStartupsPage ? "text-indigo-600" : "text-slate-400"
                        }`}
                      />
                      <span className="truncate">Стартапы и API</span>
                    </Link>
                    <Link
                      href="/admin/product-metrics"
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-colors ${
                        isProductMetricsPage
                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                          : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <BarChart3
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isProductMetricsPage ? "text-indigo-600" : "text-slate-400"
                        }`}
                      />
                      <span className="truncate">Продуктовые метрики</span>
                    </Link>
                    <Link
                      href="/admin/marketing"
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] transition-colors ${
                        isMarketingPage
                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                          : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <Megaphone
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isMarketingPage ? "text-indigo-600" : "text-slate-400"
                        }`}
                      />
                      <span className="truncate">Маркетинг</span>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Нижняя часть: Выйти + Collapse Sidebar */}
      <div className="p-3 border-t border-slate-100 space-y-2">
        <button
          type="button"
          onClick={onLogout}
          title="Выйти"
          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-[13px] font-medium text-rose-500 hover:bg-rose-50/70 transition cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-500 text-xs font-medium transition cursor-pointer"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <>
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
