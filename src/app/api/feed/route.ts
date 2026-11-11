import { NextRequest, NextResponse } from "next/server";
import {
  BotFeedMessage,
  getAllFeedMessages,
  saveAllFeedMessages,
} from "@/lib/storage";
import { deleteTelegramMessage, sendTelegramMessage } from "@/lib/telegram";

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  const headerPass = req.headers.get("x-admin-password") || "";
  return headerPass === adminPassword;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "Неверный пароль администратора" },
      { status: 401 }
    );
  }

  const feed = await getAllFeedMessages();
  return NextResponse.json({
    ok: true,
    feed,
  });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "Неверный пароль администратора" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { action } = body;

    // 1. Быстрый ответ прямо из карточки фида в тот же тред Telegram (reply_to_message_id)
    if (action === "reply") {
      const { feedItemId, chatId, replyToMessageId, text, botToken } = body as {
        feedItemId: string;
        chatId: string;
        replyToMessageId: number;
        text: string;
        botToken?: string;
      };

      if (!chatId || !text?.trim()) {
        return NextResponse.json(
          { ok: false, error: "Введите текст ответа" },
          { status: 400 }
        );
      }

      const sendRes = await sendTelegramMessage(
        chatId,
        text.trim(),
        "HTML",
        botToken,
        replyToMessageId
      );

      if (!sendRes.ok) {
        return NextResponse.json(
          { ok: false, error: sendRes.error || "Не удалось отправить ответ в Telegram" },
          { status: 400 }
        );
      }

      const feed = await getAllFeedMessages();
      const target = feed.find((f) => f.id === feedItemId);
      if (target) {
        if (!target.adminReplies) target.adminReplies = [];
        target.adminReplies.push({
          messageId: sendRes.messageId,
          text: text.trim(),
          sentAt: new Date().toISOString(),
        });
        await saveAllFeedMessages(feed);
      }

      return NextResponse.json({
        ok: true,
        messageId: sendRes.messageId,
        feed,
      });
    }

    // 2. Удаление одного сообщения из истории фида (и при желании его удаление в ТГ)
    if (action === "delete_item") {
      const { feedItemId } = body as { feedItemId: string };
      const feed = await getAllFeedMessages();
      const filtered: BotFeedMessage[] = feed.filter((f) => f.id !== feedItemId);
      await saveAllFeedMessages(filtered);
      return NextResponse.json({ ok: true, feed: filtered });
    }

    // 3. Удаление отправленного ответа админа из Telegram
    if (action === "delete_admin_reply") {
      const { feedItemId, chatId, replyMessageId, botToken } = body as {
        feedItemId: string;
        chatId: string;
        replyMessageId: number;
        botToken?: string;
      };

      const delRes = await deleteTelegramMessage(chatId, replyMessageId, botToken);
      if (!delRes.ok) {
        return NextResponse.json(
          { ok: false, error: delRes.error || "Не удалось удалить ответ из чата" },
          { status: 400 }
        );
      }

      const feed = await getAllFeedMessages();
      const target = feed.find((f) => f.id === feedItemId);
      if (target && target.adminReplies) {
        target.adminReplies = target.adminReplies.filter(
          (r) => r.messageId !== replyMessageId
        );
        await saveAllFeedMessages(feed);
      }

      return NextResponse.json({ ok: true, feed });
    }

    // 4. Очистить весь фид
    if (action === "clear_all") {
      await saveAllFeedMessages([]);
      return NextResponse.json({ ok: true, feed: [] });
    }

    return NextResponse.json({ ok: false, error: "Неизвестное действие" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Ошибка обработки запроса",
      },
      { status: 500 }
    );
  }
}
