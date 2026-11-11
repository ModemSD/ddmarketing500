export interface TelegramChatObj {
  id: number;
  title?: string;
  type: string;
}

export interface TelegramPollObj {
  id: string;
  question: string;
  options: Array<{ text: string; voter_count: number }>;
  total_voter_count: number;
  is_closed: boolean;
  is_anonymous: boolean;
}

export interface TelegramPollAnswerObj {
  poll_id: string;
  user?: {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };
  voter_chat?: {
    id: number;
    title?: string;
    username?: string;
  };
  option_ids: number[];
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: TelegramChatObj;
    text?: string;
    new_chat_title?: string;
    poll?: TelegramPollObj;
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
  poll?: TelegramPollObj;
  poll_answer?: TelegramPollAnswerObj;
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

export interface SendPollParams {
  chatId: string | number;
  question: string;
  options: string[];
  isAnonymous?: boolean;
  allowsMultipleAnswers?: boolean;
  pinMessage?: boolean;
  overrideToken?: string;
}

export async function sendTelegramPoll(params: SendPollParams): Promise<{
  ok: boolean;
  pollId?: string;
  messageId?: number;
  error?: string;
}> {
  try {
    const primaryToken = getBotToken(params.overrideToken);
    const cleanChatId = normalizeChatId(params.chatId);

    const payload = {
      chat_id: cleanChatId,
      question: params.question.slice(0, 300),
      options: params.options.map((o) => ({ text: o.trim().slice(0, 100) })),
      is_anonymous: params.isAnonymous ?? false,
      allows_multiple_answers: params.allowsMultipleAnswers ?? false,
    };

    let tokenToUse = primaryToken;
    let res = await fetch(`https://api.telegram.org/bot${tokenToUse}/sendPoll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    let data = await res.json();

    if (!data.ok && tokenToUse !== FALLBACK_BOT_TOKEN) {
      tokenToUse = FALLBACK_BOT_TOKEN;
      res = await fetch(`https://api.telegram.org/bot${tokenToUse}/sendPoll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      data = await res.json();
    }

    if (!data.ok) {
      return { ok: false, error: data.description || "Ошибка отправки опроса" };
    }

    const messageId = data.result?.message_id as number | undefined;
    const pollId = data.result?.poll?.id as string | undefined;

    if (params.pinMessage && messageId) {
      await fetch(`https://api.telegram.org/bot${tokenToUse}/pinChatMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cleanChatId,
          message_id: messageId,
          disable_notification: false,
        }),
      }).catch(() => {});
    }

    return {
      ok: true,
      pollId,
      messageId,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Неизвестная ошибка при отправке опроса",
    };
  }
}

