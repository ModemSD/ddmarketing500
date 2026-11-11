import { NextRequest, NextResponse } from "next/server";
import {
  addIncomingFeedMessage,
  extractProjectIdFromTitle,
  normalizeChatIdString,
  upsertChat,
  updatePollAnswerFromTelegram,
  updatePollStateFromTelegram,
} from "@/lib/storage";
import { TelegramUpdate } from "@/lib/telegram";

/**
 * Вебхук для Telegram:
 * 1) Автоматически привязывает чаты по первым цифрам в названии ("30211 Marketing Unit" -> "30211")
 * 2) Сохраняет ответы участников в ленту (Фид ответов на сообщения бота)
 * 3) Ловит голоса в опросах (poll и poll_answer) и обновляет сводную статистику в админке
 */
export async function POST(req: NextRequest) {
  try {
    const update = (await req.json()) as TelegramUpdate;

    // 1. Обработка чата (только когда бота добавили в группу или переименовали чат — не пересохраняем на каждое обычное сообщение)
    const chatObj =
      update.my_chat_member?.chat ||
      (update.message?.new_chat_title ? update.message.chat : undefined);

    let detectedProjectId: string | null = null;
    if (chatObj && chatObj.title) {
      detectedProjectId = extractProjectIdFromTitle(chatObj.title);
      if (detectedProjectId) {
        await upsertChat({
          projectId: detectedProjectId,
          chatId: String(chatObj.id),
          title: chatObj.title,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // 1.5. Сохранение ТОЛЬКО прямых ответов (Reply) на сообщения/опросы бота или упоминаний @ddmarketing500_bot
    const msg = update.message;
    if (msg && msg.chat && !msg.from?.is_bot) {
      const msgText = (msg.text || msg.caption || "").trim();
      const replyMsg = msg.reply_to_message;
      const isReplyToBot = Boolean(replyMsg?.from?.is_bot);
      const isMentioningBot = msgText.toLowerCase().includes("@ddmarketing500_bot");

      if (msgText && (isReplyToBot || isMentioningBot)) {
        const cleanChatId = normalizeChatIdString(msg.chat.id);
        const projId =
          detectedProjectId || extractProjectIdFromTitle(msg.chat.title) || "Чат";

        // Заодно убеждаемся, что чат привязан в базе, если из него ответили боту
        if (projId !== "Чат" && msg.chat.title) {
          await upsertChat({
            projectId: projId,
            chatId: cleanChatId,
            title: msg.chat.title,
            updatedAt: new Date().toISOString(),
          });
        }

        const senderName =
          [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") ||
          "Участник";

        const replyToText =
          replyMsg?.text ||
          replyMsg?.caption ||
          (replyMsg?.poll?.question ? `📊 Опрос: ${replyMsg.poll.question}` : undefined);

        await addIncomingFeedMessage({
          id: `${cleanChatId}_${msg.message_id}`,
          projectId: projId,
          chatId: cleanChatId,
          chatTitle: msg.chat.title || `${projId} Marketing Unit`,
          messageId: msg.message_id,
          userId: String(msg.from?.id || "0"),
          userName: senderName,
          username: msg.from?.username,
          text: msgText,
          replyToMessageId: replyMsg?.message_id,
          replyToText,
          createdAt: msg.date
            ? new Date(msg.date * 1000).toISOString()
            : new Date().toISOString(),
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
