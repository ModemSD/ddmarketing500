import { NextRequest, NextResponse } from "next/server";
import { deleteTelegramMessage, sendTelegramMessage, sleep } from "@/lib/telegram";

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  const headerPass = req.headers.get("x-admin-password") || "";
  return headerPass === adminPassword;
}

export interface SendQueueItem {
  projectId: string;
  chatId: string;
  title?: string;
  text: string;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "Неверный пароль администратора" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // 1. Удаление (отзыв) уже отправленных сообщений из чатов Telegram
    if (body.action === "delete_messages") {
      const { items, botToken } = body as {
        items: Array<{ projectId: string; chatId: string; messageId: number }>;
        botToken?: string;
      };

      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json(
          { ok: false, error: "Нет сообщений для удаления" },
          { status: 400 }
        );
      }

      const deletedResults: Array<{
        projectId: string;
        chatId: string;
        messageId: number;
        ok: boolean;
        error?: string;
      }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const res = await deleteTelegramMessage(item.chatId, item.messageId, botToken);
        deletedResults.push({
          projectId: item.projectId,
          chatId: item.chatId,
          messageId: item.messageId,
          ok: res.ok,
          error: res.error,
        });
        if (i < items.length - 1) {
          await sleep(50);
        }
      }

      const deletedCount = deletedResults.filter((r) => r.ok).length;
      return NextResponse.json({
        ok: true,
        deletedCount,
        results: deletedResults,
      });
    }

    // 2. Обычная отправка очереди сообщений
    const {
      messages,
      parseMode = "HTML",
      botToken,
    } = body as {
      messages: SendQueueItem[];
      parseMode?: "HTML" | "Markdown" | "";
      botToken?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Список сообщений для рассылки пуст" },
        { status: 400 }
      );
    }

    const results: Array<{
      projectId: string;
      chatId: string;
      title?: string;
      text?: string;
      messageId?: number;
      ok: boolean;
      error?: string;
    }> = [];

    for (let i = 0; i < messages.length; i++) {
      const item = messages[i];
      if (!item.chatId || !item.text?.trim()) {
        results.push({
          projectId: item.projectId,
          chatId: item.chatId,
          title: item.title,
          text: item.text,
          ok: false,
          error: "Пустой chat_id или текст сообщения",
        });
        continue;
      }

      const res = await sendTelegramMessage(item.chatId, item.text, parseMode, botToken);
      results.push({
        projectId: item.projectId,
        chatId: item.chatId,
        title: item.title,
        text: item.text,
        messageId: res.messageId,
        ok: res.ok,
        error: res.error,
      });

      if (i < messages.length - 1) {
        await sleep(60);
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      ok: true,
      successCount,
      failCount,
      results,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Ошибка при выполнении рассылки",
      },
      { status: 500 }
    );
  }
}
