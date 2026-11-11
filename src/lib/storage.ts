import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

export interface StartupChat {
  projectId: string; // Первые цифры названия в ТГ, например "30211"
  chatId: string; // Технический ID чата в Telegram, например "-1001234567890"
  title: string; // Полное название чата, например "30211 Marketing Unit"
  updatedAt: string;
}

const KV_KEY = "bot500:chats";

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    return new Redis({ url, token });
  }
  return null;
}

function getLocalFilePath(): string {
  // На Vercel можно писать в /tmp, локально — в ./data/chats.json
  const isVercel = Boolean(process.env.VERCEL);
  const dir = isVercel ? "/tmp" : path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "chats.json");
}

export function extractProjectIdFromTitle(title?: string): string | null {
  if (!title) return null;
  const match = title.trim().match(/^(\d+)/);
  return match ? match[1] : null;
}

const DEFAULT_INITIAL_CHATS: Record<string, StartupChat> = {
  "26666": {
    projectId: "26666",
    chatId: "-5560094301",
    title: "26666 Marketing Unit",
    updatedAt: "2026-11-11T08:40:00.000Z",
  },
  "25555": {
    projectId: "25555",
    chatId: "-5257696187",
    title: "25555 Marketing Unit",
    updatedAt: "2026-11-11T08:40:00.000Z",
  },
};

export async function getAllChats(): Promise<Record<string, StartupChat>> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<Record<string, StartupChat>>(KV_KEY);
    return { ...DEFAULT_INITIAL_CHATS, ...(data || {}) };
  }

  const filePath = getLocalFilePath();
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_INITIAL_CHATS };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, StartupChat>;
    return { ...DEFAULT_INITIAL_CHATS, ...parsed };
  } catch {
    return { ...DEFAULT_INITIAL_CHATS };
  }
}

export async function saveAllChats(chats: Record<string, StartupChat>): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(KV_KEY, chats);
    return;
  }

  const filePath = getLocalFilePath();
  fs.writeFileSync(filePath, JSON.stringify(chats, null, 2), "utf-8");
}

export function normalizeChatIdString(chatId: string | number): string {
  return String(chatId)
    .trim()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
}

export async function upsertChat(chat: StartupChat): Promise<Record<string, StartupChat>> {
  const chats = await getAllChats();
  chats[chat.projectId] = {
    ...chat,
    chatId: normalizeChatIdString(chat.chatId),
  };
  await saveAllChats(chats);
  return chats;
}

export async function removeChat(projectId: string): Promise<Record<string, StartupChat>> {
  const chats = await getAllChats();
  delete chats[projectId];
  await saveAllChats(chats);
  return chats;
}

