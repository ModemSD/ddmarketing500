export type AdChannelSource = "yandex_direct" | "tg_ads" | "vk_ads";

export type ApiConnectionStatus = "active" | "pending" | "error";

export interface DailyProductMetricPoint {
  date: string; // YYYY-MM-DD (МСК)
  dau: number;
  llm_requests: number;
  tool_requests: number;
  tool_calls: number; // llm_requests + tool_requests
  total_users: number;
  new_users: number;
}

export interface AdChannelSummary {
  source: AdChannelSource;
  label: string;
  connected: boolean;
  accountId?: string;
  impressions: number;
  clicks: number;
  spendRub: number;
  conversions: number;
  cpcRub: number;
  cpaRub: number;
}

export interface MetrikaSummary {
  connected: boolean;
  counterId?: string;
  platform: "Яндекс.Метрика" | "AppMetrica";
  visits7d: number;
  users7d: number;
  goalCompletions7d: number;
  conversionRatePct: number;
}

export interface StartupAnalyticsRecord {
  projectId: string; // Например "25555"
  name: string; // Например "Аркан — ИИ-таролог"
  chatTitle: string; // "25555 Marketing Unit"
  chatId?: string;
  cohort: string; // "500_13"
  trackerName: string; // Трекер / Маркетолог
  productType: string; // "Telegram мини-приложение" | "Web SaaS" | "Мобильное приложение"
  budgetTotalRub: number;
  budgetSpentRub: number;
  apiStatus: ApiConnectionStatus;
  apiEndpoint?: string;
  lastApiSyncAt?: string;
  // Текущие продуктовые показатели (по ТЗ API)
  currentDau: number;
  dauChangePct: number;
  llmRequests7d: number;
  toolRequests7d: number;
  toolCalls7d: number; // llm + tool
  totalUsers: number;
  newUsers7d: number;
  // Рекламные каналы (Директ, TG Ads, VK Ads)
  adChannels: AdChannelSummary[];
  // Яндекс.Метрика / AppMetrica
  metrika: MetrikaSummary;
  // История по дням за последние 14 дней
  dailyHistory: DailyProductMetricPoint[];
}
