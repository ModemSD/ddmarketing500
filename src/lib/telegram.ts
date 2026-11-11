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
  const digits = String(chatId).replace(/\D/g, "");
  if (!digits) return String(chatId).trim();
  return `-${digits}`;
}

async function callSendMessage(
  token: string,
  chatId: string,
  text: string,
  parseMode: "HTML" | "Markdown" | ""
): Promise<{ ok: boolean; description?: string }> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
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

  return await res.json();
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  parseMode: "HTML" | "Markdown" | "" = "HTML",
  overrideToken?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const primaryToken = getBotToken(overrideToken);
    const cleanChatId = normalizeChatId(chatId);

    let data = await callSendMessage(primaryToken, cleanChatId, text, parseMode);

    // Если в настройках браузера/Vercel был указан старый/другой бот, у которого нет этого чата,
    // пробуем отправить через основной токен @ddmarketing500_bot
    if (!data.ok && primaryToken !== FALLBACK_BOT_TOKEN) {
      const retryData = await callSendMessage(FALLBACK_BOT_TOKEN, cleanChatId, text, parseMode);
      if (retryData.ok) {
        return { ok: true };
      }
    }

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

