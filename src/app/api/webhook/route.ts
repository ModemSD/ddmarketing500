import { NextRequest, NextResponse } from "next/server";
import { extractProjectIdFromTitle, upsertChat } from "@/lib/storage";
import { TelegramUpdate } from "@/lib/telegram";

/**
 * Вебхук для Telegram: автоматически ловит сообщения, добавление бота в группу
 * или переименование группы, извлекает первые цифры из названия (например "30211 Marketing Unit" -> "30211")
 * и сохраняет привязку projectId -> chatId в базу (Vercel KV / Upstash Redis).
 */
export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;

    const chatObj =
      update.message?.chat ||
      update.my_chat_member?.chat ||
      update.channel_post?.chat;

    if (chatObj && chatObj.title) {
      const projectId = extractProjectIdFromTitle(chatObj.title);
      if (projectId) {
        await upsertChat({
          projectId,
          chatId: String(chatObj.id),
          title: chatObj.title,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Telegram Webhook endpoint is active",
  });
}

