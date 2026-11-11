import { NextRequest, NextResponse } from "next/server";
import {
  addPollCampaign,
  getAllPolls,
  PollCampaign,
  PollChatInstance,
  saveAllPolls,
} from "@/lib/storage";
import { sendTelegramPoll, sleep } from "@/lib/telegram";

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

    if (action === "delete") {
      const { pollCampaignId } = body;
      const polls = await getAllPolls();
      const filtered = polls.filter((p) => p.id !== pollCampaignId);
      await saveAllPolls(filtered);
      return NextResponse.json({ ok: true, polls: filtered });
    }

    // Отправка нового опроса по выбранным чатам
    const {
      question,
      options,
      isAnonymous = false,
      allowsMultipleAnswers = false,
      pinMessage = false,
      targets,
      botToken,
    } = body as {
      question: string;
      options: string[];
      isAnonymous?: boolean;
      allowsMultipleAnswers?: boolean;
      pinMessage?: boolean;
      targets: Array<{ projectId: string; chatId: string; title: string }>;
      botToken?: string;
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
      question: question.trim(),
      options: cleanOptions,
      isAnonymous,
      allowsMultipleAnswers,
      createdAt: new Date().toISOString(),
      chats: campaignChats,
    };

    const polls = await addPollCampaign(campaign);
    const successCount = results.filter((r) => r.ok).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      ok: true,
      successCount,
      failCount,
      results,
      polls,
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

