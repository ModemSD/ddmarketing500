import { Redis } from "@upstash/redis";
import fs from "fs";
import path from "path";

export interface StartupChat {
  projectId: string; // Первые цифры названия в ТГ, например "30211"
  chatId: string; // Технический ID чата в Telegram, например "-1001234567890"
  title: string; // Полное название чата, например "30211 Marketing Unit"
  updatedAt: string;
}

export interface PollOptionStat {
  text: string;
  voterCount: number;
}

export interface PollVoteUser {
  userId: string;
  name: string;
  username?: string;
  optionIds: number[];
  votedAt: string;
}

export interface PollChatInstance {
  pollId: string; // Telegram poll.id
  projectId: string;
  chatId: string;
  chatTitle: string;
  messageId?: number;
  totalVoterCount: number;
  options: PollOptionStat[];
  voters: Record<string, PollVoteUser>; // userId -> голос
  updatedAt: string;
}

export interface PollCampaign {
  id: string;
  folder: string; // Папка / категория опроса, например "Еженедельные чекины" или "11.11.2026"
  question: string;
  options: string[];
  isAnonymous: boolean;
  allowsMultipleAnswers: boolean;
  createdAt: string;
  chats: Record<string, PollChatInstance>; // projectId -> PollChatInstance
}

export interface BotFeedMessage {
  id: string; // `${chatId}_${messageId}`
  projectId: string;
  chatId: string;
  chatTitle: string;
  messageId: number;
  userId: string;
  userName: string;
  username?: string;
  text: string;
  replyToMessageId?: number;
  replyToText?: string;
  createdAt: string;
  adminReplies?: Array<{
    messageId?: number;
    text: string;
    sentAt: string;
  }>;
}

const KV_KEY = "bot500:chats";
const KV_POLLS_KEY = "bot500:polls";
const KV_FEED_KEY = "bot500:feed";
const KV_PAUSED_KEY = "bot500:paused";

function getRedis(): Redis | null {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.STORAGE_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.STORAGE_REST_API_TOKEN;
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

const DEFAULT_INITIAL_CHATS: Record<string, StartupChat> = {};

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
  const digits = String(chatId).replace(/\D/g, "");
  if (!digits) return "";
  return `-${digits}`;
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

function getLocalPollsFilePath(): string {
  const isVercel = Boolean(process.env.VERCEL);
  const dir = isVercel ? "/tmp" : path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "polls.json");
}

const DEFAULT_INITIAL_POLLS: PollCampaign[] = [];

export async function getAllPolls(): Promise<PollCampaign[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<PollCampaign[]>(KV_POLLS_KEY);
    return data && data.length > 0 ? data : DEFAULT_INITIAL_POLLS;
  }

  const filePath = getLocalPollsFilePath();
  if (!fs.existsSync(filePath)) {
    return [...DEFAULT_INITIAL_POLLS];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as PollCampaign[];
    return parsed && parsed.length > 0 ? parsed : [...DEFAULT_INITIAL_POLLS];
  } catch {
    return [...DEFAULT_INITIAL_POLLS];
  }
}

export async function saveAllPolls(polls: PollCampaign[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(KV_POLLS_KEY, polls);
    return;
  }

  const filePath = getLocalPollsFilePath();
  fs.writeFileSync(filePath, JSON.stringify(polls, null, 2), "utf-8");
}

export async function addPollCampaign(campaign: PollCampaign): Promise<PollCampaign[]> {
  const polls = await getAllPolls();
  polls.unshift(campaign);
  const trimmed = polls.slice(0, 30); // храним последние 30 опросов
  await saveAllPolls(trimmed);
  return trimmed;
}

export async function updatePollStateFromTelegram(
  pollId: string,
  options: PollOptionStat[],
  totalVoterCount: number
): Promise<void> {
  const polls = await getAllPolls();
  let changed = false;
  for (const campaign of polls) {
    for (const pid of Object.keys(campaign.chats)) {
      const inst = campaign.chats[pid];
      if (String(inst.pollId) === String(pollId)) {
        inst.options = options;
        inst.totalVoterCount = totalVoterCount;
        inst.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
  }
  if (changed) {
    await saveAllPolls(polls);
  }
}

export async function updatePollAnswerFromTelegram(
  pollId: string,
  user: { id: number; first_name?: string; last_name?: string; username?: string },
  optionIds: number[]
): Promise<void> {
  const polls = await getAllPolls();
  let changed = false;
  for (const campaign of polls) {
    for (const pid of Object.keys(campaign.chats)) {
      const inst = campaign.chats[pid];
      if (String(inst.pollId) === String(pollId)) {
        const uid = String(user.id);
        if (!inst.voters) inst.voters = {};
        if (optionIds.length === 0) {
          delete inst.voters[uid];
        } else {
          const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Участник";
          inst.voters[uid] = {
            userId: uid,
            name: fullName,
            username: user.username,
            optionIds,
            votedAt: new Date().toISOString(),
          };
        }
        // Пересчитываем счетчики вариантов строго по голосам
        const counts = inst.options.map(() => 0);
        for (const v of Object.values(inst.voters)) {
          for (const optIdx of v.optionIds) {
            if (counts[optIdx] !== undefined) counts[optIdx]++;
          }
        }
        inst.options = inst.options.map((opt, idx) => ({
          ...opt,
          voterCount: counts[idx] ?? 0,
        }));
        inst.totalVoterCount = Object.keys(inst.voters).length;
        inst.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
  }
  if (changed) {
    await saveAllPolls(polls);
  }
}

function getLocalFeedFilePath(): string {
  const isVercel = Boolean(process.env.VERCEL);
  const dir = isVercel ? "/tmp" : path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "feed.json");
}

export async function getAllFeedMessages(): Promise<BotFeedMessage[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get<BotFeedMessage[]>(KV_FEED_KEY);
    return Array.isArray(data) ? data : [];
  }

  const filePath = getLocalFeedFilePath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as BotFeedMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAllFeedMessages(items: BotFeedMessage[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(KV_FEED_KEY, items);
    return;
  }

  const filePath = getLocalFeedFilePath();
  fs.writeFileSync(filePath, JSON.stringify(items, null, 2), "utf-8");
}

export async function addIncomingFeedMessage(item: BotFeedMessage): Promise<BotFeedMessage[]> {
  const feed = await getAllFeedMessages();
  const existingIdx = feed.findIndex((f) => f.id === item.id);
  if (existingIdx !== -1) {
    feed[existingIdx] = {
      ...feed[existingIdx],
      ...item,
      adminReplies: feed[existingIdx].adminReplies || item.adminReplies,
    };
  } else {
    feed.unshift(item);
  }
  const trimmed = feed.slice(0, 200); // храним последние 200 сообщений в ленте
  await saveAllFeedMessages(trimmed);
  return trimmed;
}

export async function getBotPaused(): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const val = await redis.get<boolean>(KV_PAUSED_KEY);
    return Boolean(val);
  }
  const isVercel = Boolean(process.env.VERCEL);
  const dir = isVercel ? "/tmp" : path.join(process.cwd(), "data");
  const filePath = path.join(dir, "paused.json");
  if (!fs.existsSync(filePath)) return false;
  try {
    return Boolean(JSON.parse(fs.readFileSync(filePath, "utf-8")));
  } catch {
    return false;
  }
}

export async function setBotPaused(paused: boolean): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    await redis.set(KV_PAUSED_KEY, paused);
    return paused;
  }
  const isVercel = Boolean(process.env.VERCEL);
  const dir = isVercel ? "/tmp" : path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, "paused.json"), JSON.stringify(paused), "utf-8");
  return paused;
}



