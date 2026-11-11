import { NextRequest, NextResponse } from "next/server";
import {
  extractProjectIdFromTitle,
  getAllChats,
  normalizeChatIdString,
  removeChat,
  saveAllChats,
  StartupChat,
  upsertChat,
} from "@/lib/storage";
import { getBotToken, TelegramUpdate } from "@/lib/telegram";

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  const headerPass = req.headers.get("x-admin-password") || "";
  return headerPass === adminPassword;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "Неверный пароль администратора" }, { status: 401 });
  }

  const chats = await getAllChats();
  const hasKv = Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
  const hasBotToken = true;

  return NextResponse.json({
    ok: true,
    chats,
    hasKv,
    hasBotToken,
    defaultSheetUrl: process.env.DEFAULT_SHEET_URL || "",
  });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "Неверный пароль администратора" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // 1. Ручное добавление / обновление одного чата
    if (action === "upsert") {
      const { projectId, chatId, title } = body;
      if (!projectId || !chatId) {
        return NextResponse.json(
          { ok: false, error: "Укажите ID проекта и Telegram chat_id" },
          { status: 400 }
        );
      }
      const chats = await upsertChat({
        projectId: String(projectId).trim(),
        chatId: String(chatId).trim(),
        title: String(title || `${projectId} Marketing Unit`).trim(),
        updatedAt: new Date().toISOString(),
      });
      return NextResponse.json({ ok: true, chats });
    }

    // 2. Массовый импорт списка чатов (JSON или построчно "30211 -100123456789 Название")
    if (action === "bulk_import") {
      const { items } = body as { items: StartupChat[] };
      const chats = await getAllChats();
      for (const item of items || []) {
        if (item.projectId && item.chatId) {
          chats[String(item.projectId).trim()] = {
            projectId: String(item.projectId).trim(),
            chatId: normalizeChatIdString(item.chatId),
            title: item.title || `${item.projectId} Marketing Unit`,
            updatedAt: new Date().toISOString(),
          };
        }
      }
      await saveAllChats(chats);
      return NextResponse.json({ ok: true, chats });
    }

    // 3. Удаление чата
    if (action === "delete") {
      const { projectId } = body;
      const chats = await removeChat(String(projectId).trim());
      return NextResponse.json({ ok: true, chats });
    }

    // 4. Синхронизация через getUpdates (автоматически отключает webhook перед getUpdates, если он мешает)
    if (action === "sync_updates") {
      const token = getBotToken(body.botToken);
      let res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`);
      let data = await res.json();

      // Если активен Webhook, Telegram возвращает 409 Conflict — отключаем Webhook с сохранением очереди и читаем getUpdates
      if (!data.ok && String(data.description || "").toLowerCase().includes("webhook")) {
        await fetch(
          `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`
        );
        res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`);
        data = await res.json();
      }

      if (!data.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: data.description || "Не удалось получить getUpdates",
          },
          { status: 400 }
        );
      }

      const updates = (data.result || []) as TelegramUpdate[];
      const chats = await getAllChats();
      let foundCount = 0;

      for (const u of updates) {
        const chatObj = u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat;
        if (chatObj && chatObj.title) {
          const pid = extractProjectIdFromTitle(chatObj.title);
          if (pid) {
            chats[pid] = {
              projectId: pid,
              chatId: String(chatObj.id),
              title: chatObj.title,
              updatedAt: new Date().toISOString(),
            };
            foundCount++;
          }
        }
      }
      await saveAllChats(chats);
      return NextResponse.json({ ok: true, chats, foundCount });
    }

    // 5. Установка Webhook на текущий домен Vercel
    if (action === "set_webhook") {
      const token = getBotToken(body.botToken);
      const webhookUrl = body.webhookUrl;
      if (!webhookUrl) {
        return NextResponse.json({ ok: false, error: "Не указан URL вебхука" }, { status: 400 });
      }
      const res = await fetch(
        `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
      );
      const data = await res.json();
      if (!data.ok) {
        return NextResponse.json(
          { ok: false, error: data.description || "Ошибка установки вебхука" },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: true, description: data.description });
    }

    return NextResponse.json({ ok: false, error: "Неизвестное действие" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Ошибка сервера" },
      { status: 500 }
    );
  }
}

