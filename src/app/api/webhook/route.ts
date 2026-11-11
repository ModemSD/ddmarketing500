import { NextRequest, NextResponse } from "next/server";
import {
  extractProjectIdFromTitle,
  upsertChat,
  updatePollAnswerFromTelegram,
  updatePollStateFromTelegram,
} from "@/lib/storage";
import { TelegramUpdate } from "@/lib/telegram";

/**
 * Вебхук для Telegram:
 * 1) Автоматически привязывает чаты по первым цифрам в названии ("30211 Marketing Unit" -> "30211")
 * 2) Ловит голоса в опросах (poll и poll_answer) и обновляет сводную статистику в админке
 */
export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;

    // 1. Обработка чата (новое сообщение или добавление бота)
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

    // 2. Обработка конкретного голоса участника в неанонимном опросе (poll_answer)
    // Важно: когда человек голосует в Telegram, Telegram присылает ДВА вебхука одновременно (update.poll и update.poll_answer).
    // Чтобы update.poll не перезаписал voters старым стейтом из Redis (race condition),
    // при неанонимных опросах мы обновляем и список voters, и счетчики прямо из poll_answer!
    if (update.poll_answer) {
      const voterUser = update.poll_answer.user || {
        id: update.poll_answer.voter_chat?.id || Date.now(),
        first_name: update.poll_answer.voter_chat?.title || "Участник",
        username: update.poll_answer.voter_chat?.username,
      };
      await updatePollAnswerFromTelegram(
        update.poll_answer.poll_id,
        voterUser,
        update.poll_answer.option_ids || []
      );
    }

    // 3. Обработка обновления счетчиков опроса (poll) — ТОЛЬКО для анонимных опросов!
    // Для неанонимных опросов (is_anonymous: false) все счетчики И список проголосовавших (voters)
    // уже считает updatePollAnswerFromTelegram выше. Если сохранять и update.poll одновременно,
    // два параллельных запроса в Redis перезаписывают друг друга (race condition) и стирают поле voters!
    if (update.poll && update.poll.is_anonymous) {
      await updatePollStateFromTelegram(
        update.poll.id,
        update.poll.options.map((o) => ({ text: o.text, voterCount: o.voter_count })),
        update.poll.total_voter_count
      );
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
