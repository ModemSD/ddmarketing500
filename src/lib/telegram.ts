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

export function getBotToken(overrideToken?: string): string {
  const token = (overrideToken || process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) {
    throw new Error(
      "Не задан TELEGRAM_BOT_TOKEN. Добавьте его в переменные окружения Vercel (.env.local) или укажите в настройках админки."
    );
  }
  return token;
}

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  parseMode: "HTML" | "Markdown" | "" = "HTML",
  overrideToken?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = getBotToken(overrideToken);
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

