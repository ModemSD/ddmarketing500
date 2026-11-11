import { NextRequest, NextResponse } from "next/server";
import {
  addPollCampaign,
  getAllPolls,
  PollCampaign,
  PollChatInstance,
  saveAllPolls,
} from "@/lib/storage";
import { getBotToken, sendTelegramPoll, sleep, TelegramUpdate } from "@/lib/telegram";

function checkAuth(req: NextRequest): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return true;
  const headerPass = req.headers.get("x-admin-password") || "";
  return headerPass === adminPassword;
}

/**
 * Применяет свежие события poll и poll_answer из Telegram getUpdates
 * к переданному массиву опросов (из базы + из браузера клиента),
 * чтобы голоса гарантированно отображались даже без Redis на Vercel.
 */
function applyUpdatesToPolls(
  polls: PollCampaign[],
  updates: TelegramUpdate[]
): PollCampaign[] {
  const nextPolls: PollCampaign[] = JSON.parse(JSON.stringify(polls));

  for (const u of updates) {
    if (u.poll) {
      const pollId = String(u.poll.id);
      for (const campaign of nextPolls) {
        for (const pid of Object.keys(campaign.chats || {})) {
          const inst = campaign.chats[pid];
          if (String(inst.pollId) === pollId) {
            inst.options = u.poll.options.map((o) => ({
              text: o.text,
              voterCount: o.voter_count,
            }));
            inst.totalVoterCount = u.poll.total_voter_count;
            inst.updatedAt = new Date().toISOString();
          }
        }
      }
    }

    if (u.poll_answer && u.poll_answer.user) {
      const pollId = String(u.poll_answer.poll_id);
      const user = u.poll_answer.user;
      const optionIds = u.poll_answer.option_ids || [];

      for (const campaign of nextPolls) {
        for (const pid of Object.keys(campaign.chats || {})) {
          const inst = campaign.chats[pid];
          if (String(inst.pollId) === pollId) {
            if (!inst.voters) inst.voters = {};
            const uid = String(user.id);
            if (optionIds.length === 0) {
              delete inst.voters[uid];
            } else {
              const fullName =
                [user.first_name, user.last_name].filter(Boolean).join(" ") ||
                "Участник";
              inst.voters[uid] = {
                userId: uid,
                name: fullName,
                username: user.username,
                optionIds,
                votedAt: new Date().toISOString(),
              };
            }

            const counts = inst.options.map(() => 0);
            for (const v of Object.values(inst.voters)) {
              for (const optIdx of v.optionIds) {
                if (counts[optIdx] !== undefined) counts[optIdx]++;
              }
            }
            inst.options = inst.options.map((opt, idx) => ({
              ...opt,
              voterCount: Math.max(opt.voterCount, counts[idx] || 0),
            }));
            inst.totalVoterCount = Math.max(
              inst.totalVoterCount,
              Object.keys(inst.voters).length
            );
            inst.updatedAt = new Date().toISOString();
          }
        }
      }
    }
  }

  return nextPolls;
}

function mergePollCampaignLists(
  serverPolls: PollCampaign[],
  clientPolls: PollCampaign[]
): PollCampaign[] {
  const map = new Map<string, PollCampaign>();
  for (const p of clientPolls || []) {
    if (p && p.id) map.set(p.id, p);
  }
  for (const p of serverPolls || []) {
    if (p && p.id) {
      const existing = map.get(p.id);
      if (!existing) {
        map.set(p.id, p);
      } else {
        // Объединяем данные голосов
        const mergedChats: Record<string, PollChatInstance> = {
          ...existing.chats,
          ...p.chats,
        };
        for (const pid of Object.keys(mergedChats)) {
          const cChat = existing.chats?.[pid];
          const sChat = p.chats?.[pid];
          if (cChat && sChat) {
            mergedChats[pid] = {
              ...sChat,
              totalVoterCount: Math.max(cChat.totalVoterCount || 0, sChat.totalVoterCount || 0),
              voters: { ...(cChat.voters || {}), ...(sChat.voters || {}) },
              options: (sChat.options || []).map((opt, idx) => ({
                text: opt.text,
                voterCount: Math.max(
                  opt.voterCount || 0,
                  cChat.options?.[idx]?.voterCount || 0
                ),
              })),
            };
          }
        }
        map.set(p.id, {
          ...existing,
          ...p,
          folder: p.folder || existing.folder || "Общие опросы",
          chats: mergedChats,
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "Неверный пароль администратора" }, { status: 401 });
  }
  const polls = await getAllPolls();
  return NextResponse.json({ ok: true, polls });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "Неверный пароль администратора" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // 1. Синхронизация голосов из Telegram getUpdates + объединение с клиентским стейтом
    if (action === "sync_votes") {
      const token = getBotToken(body.botToken);
      const clientPolls = (body.clientPolls || []) as PollCampaign[];
      const serverPolls = await getAllPolls();
      let combined = mergePollCampaignLists(serverPolls, clientPolls);

      const allowed = encodeURIComponent(
        JSON.stringify(["message", "my_chat_member", "channel_post", "poll", "poll_answer"])
      );
      let res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?limit=100&allowed_updates=${allowed}`
      );
      let data = await res.json();

      if (!data.ok && String(data.description || "").toLowerCase().includes("webhook")) {
        await fetch(
          `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`
        );
        res = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?limit=100&allowed_updates=${allowed}`
        );
        data = await res.json();
      }

      if (data.ok && Array.isArray(data.result)) {
        combined = applyUpdatesToPolls(combined, data.result as TelegramUpdate[]);
      }

      await saveAllPolls(combined);
      return NextResponse.json({ ok: true, polls: combined });
    }

    // 2. Перемещение опроса в другую папку
    if (action === "move_folder") {
      const { pollCampaignId, folder, clientPolls = [] } = body;
      const serverPolls = await getAllPolls();
      const combined = mergePollCampaignLists(serverPolls, clientPolls);
      for (const p of combined) {
        if (p.id === pollCampaignId) {
          p.folder = String(folder || "Общие опросы").trim();
        }
      }
      await saveAllPolls(combined);
      return NextResponse.json({ ok: true, polls: combined });
    }

    // 2b. Удаление папки (перенос опросов из удаленной папки в резервную)
    if (action === "delete_folder") {
      const { folderToDelete, fallbackFolder = "Общие опросы", clientPolls = [] } = body;
      const serverPolls = await getAllPolls();
      const combined = mergePollCampaignLists(serverPolls, clientPolls);
      for (const p of combined) {
        if ((p.folder || "Общие опросы").trim() === String(folderToDelete).trim()) {
          p.folder = String(fallbackFolder).trim();
        }
      }
      await saveAllPolls(combined);
      return NextResponse.json({ ok: true, polls: combined });
    }

    // 3. Удаление опроса из истории
    if (action === "delete") {
      const { pollCampaignId, clientPolls = [] } = body;
      const serverPolls = await getAllPolls();
      const combined = mergePollCampaignLists(serverPolls, clientPolls);
      const filtered = combined.filter((p) => p.id !== pollCampaignId);
      await saveAllPolls(filtered);
      return NextResponse.json({ ok: true, polls: filtered });
    }

    // 4. Отправка нового опроса по выбранным чатам
    const {
      folder = "Общие опросы",
      question,
      options,
      isAnonymous = false,
      allowsMultipleAnswers = false,
      pinMessage = false,
      targets,
      botToken,
      clientPolls = [],
    } = body as {
      folder?: string;
      question: string;
      options: string[];
      isAnonymous?: boolean;
      allowsMultipleAnswers?: boolean;
      pinMessage?: boolean;
      targets: Array<{ projectId: string; chatId: string; title: string }>;
      botToken?: string;
      clientPolls?: PollCampaign[];
    };

    const cleanOptions = (options || []).map((o) => o.trim()).filter(Boolean);
    if (!question?.trim()) {
      return NextResponse.json({ ok: false, error: "Введите вопрос опроса" }, { status: 400 });
    }
    if (cleanOptions.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Добавьте минимум 2 варианта ответа" },
        { status: 400 }
      );
    }
    if (!Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Выберите хотя бы один чат стартапа" },
        { status: 400 }
      );
    }

    const campaignChats: Record<string, PollChatInstance> = {};
    const results: Array<{
      projectId: string;
      chatId: string;
      title?: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const personalizedQuestion = question
        .replace(/\{ID\}/gi, t.projectId)
        .replace(/\{TITLE\}/gi, t.title || t.projectId);

      const res = await sendTelegramPoll({
        chatId: t.chatId,
        question: personalizedQuestion,
        options: cleanOptions,
        isAnonymous,
        allowsMultipleAnswers,
        pinMessage,
        overrideToken: botToken,
      });

      results.push({
        projectId: t.projectId,
        chatId: t.chatId,
        title: t.title,
        ok: res.ok,
        error: res.error,
      });

      if (res.ok && res.pollId) {
        campaignChats[t.projectId] = {
          pollId: res.pollId,
          projectId: t.projectId,
          chatId: t.chatId,
          chatTitle: t.title,
          messageId: res.messageId,
          totalVoterCount: 0,
          options: cleanOptions.map((optText) => ({
            text: optText,
            voterCount: 0,
          })),
          voters: {},
          updatedAt: new Date().toISOString(),
        };
      }

      if (i < targets.length - 1) {
        await sleep(70);
      }
    }

    const campaign: PollCampaign = {
      id: `poll_${Date.now()}`,
      folder: (folder || "Общие опросы").trim() || "Общие опросы",
      question: question.trim(),
      options: cleanOptions,
      isAnonymous,
      allowsMultipleAnswers,
      createdAt: new Date().toISOString(),
      chats: campaignChats,
    };

    const serverPolls = await getAllPolls();
    const mergedExisting = mergePollCampaignLists(serverPolls, clientPolls);
    const updatedPolls = [campaign, ...mergedExisting].slice(0, 50);
    await saveAllPolls(updatedPolls);
    await addPollCampaign(campaign).catch(() => {});

    const successCount = results.filter((r) => r.ok).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      ok: true,
      successCount,
      failCount,
      results,
      polls: updatedPolls,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Ошибка при создании опроса",
      },
      { status: 500 }
    );
  }
}
