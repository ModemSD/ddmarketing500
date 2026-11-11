export interface TelegramChatObj {
  id: number;
  title?: string;
  type: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: TelegramChatObj;
    text?: string;
    new_chat_title?: string;
  };
  my_chat_member?: {
    chat: TelegramChatObj;
    new_chat_member?: {
      status: string;
    };
  };
  channel_post?: {
    chat: TelegramChatObj;
    text?: string;
  };
}

const FALLBACK_BOT_TOKEN = "9223435288:AAHbLDSDvrIIWzN0OVaG9aS2dls_ktAvXYg";

export function getBotToken(overrideToken?: string): string {
  const token = (overrideToken || process.env.TELEGRAM_BOT_TOKEN || FALLBACK_BOT_TOKEN).trim();
  if (!token) {
    throw new Error(
      "Не задан TELEGRAM_BOT_TOKEN. Добавьте его в переменные окружения Vercel (.env.local) или укажите в настройках админки."
    );
  }
  return token;
}

function normalizeChatId(chatId: string | number): string {
  // Заменяем любые нестандартные тире (en-dash –, em-dash —, minus −) на обычный дефис "-"
  return String(chatId)
    .trim()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  parseMode: "HTML" | "Markdown" | "" = "HTML",
  overrideToken?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = getBotToken(overrideToken);
    const cleanChatId = normalizeChatId(chatId);
    const body: Record<string, unknown> = {
      chat_id: cleanChatId,
      text,
      disable_web_page_preview: true,
    };
    if (parseMode) {
      body.parse_mode = parseMode;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.description || "Ошибка Telegram API" };
    }
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Неизвестная ошибка при отправке",
    };
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

