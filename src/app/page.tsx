"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  FileSpreadsheet,
  Users,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Settings,
  Download,
  Upload,
  Sparkles,
  Search,
  CheckSquare,
  Square,
  Eye,
  Link2,
  X,
  BarChart3,
  Pin,
  Folder,
  Filter,
} from "lucide-react";

interface StartupChat {
  projectId: string;
  chatId: string;
  title: string;
  updatedAt: string;
}

interface SheetColumnInfo {
  letter: string;
  label: string;
  sample: string;
}

interface SendResultItem {
  projectId: string;
  chatId: string;
  title?: string;
  text?: string;
  messageId?: number;
  deleted?: boolean;
  ok: boolean;
  error?: string;
}

interface SentBatchHistory {
  id: string;
  createdAt: string;
  items: SendResultItem[];
}

interface QueuedMessage {
  projectId: string;
  chatId: string;
  title?: string;
  text: string;
}

interface ConfirmModalState {
  title: string;
  subtitle: string;
  messages: QueuedMessage[];
}

interface PollOptionStat {
  text: string;
  voterCount: number;
}

interface PollVoteUser {
  userId: string;
  name: string;
  username?: string;
  optionIds: number[];
  votedAt: string;
}

interface PollChatInstance {
  pollId: string;
  projectId: string;
  chatId: string;
  chatTitle: string;
  messageId?: number;
  totalVoterCount: number;
  options: PollOptionStat[];
  voters: Record<string, PollVoteUser>;
  updatedAt: string;
}

interface PollCampaign {
  id: string;
  folder?: string;
  question: string;
  options: string[];
  isAnonymous: boolean;
  allowsMultipleAnswers: boolean;
  createdAt: string;
  chats: Record<string, PollChatInstance>;
}

function normalizeDash(str: string): string {
  const digits = String(str).replace(/\D/g, "");
  if (!digits) return String(str).trim();
  return `-${digits}`;
}

function columnLetterToIndex(letter: string): number {
  const clean = letter.trim().toUpperCase();
  let index = 0;
  for (let i = 0; i < clean.length; i++) {
    index = index * 26 + (clean.charCodeAt(i) - 64);
  }
  return index - 1;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<"sheet" | "broadcast" | "polls" | "chats">("sheet");

  // Авторизация и настройки
  const [adminPassword, setAdminPassword] = useState("");
  const [customBotToken, setCustomBotToken] = useState("");
  const [hasServerBotToken, setHasServerBotToken] = useState(false);
  const [hasKv, setHasKv] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Чаты стартапов
  const [chats, setChats] = useState<Record<string, StartupChat>>({});
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  // Ручное добавление чата
  const [newProjectId, setNewProjectId] = useState("");
  const [newChatId, setNewChatId] = useState("");
  const [newChatTitle, setNewChatTitle] = useState("");
  const [bulkImportText, setBulkImportText] = useState("");

  // Вкладка 1: Конструктор по Google Таблице
  const [sheetUrl, setSheetUrl] = useState("");
  const [headerRowNumber, setHeaderRowNumber] = useState<number>(1);
  const [dataStartRowNumber, setDataStartRowNumber] = useState<number>(2);
  const [sheetColumns, setSheetColumns] = useState<SheetColumnInfo[]>([]);
  const [rawGrid, setRawGrid] = useState<string[][]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [idColumnLetter, setIdColumnLetter] = useState<string>("A");
  const [sheetTemplate, setSheetTemplate] = useState<string>(
    "Привет, команда проекта #{ID}!\n\nВаш шаблон отчёта:\n{B}"
  );
  const [customCellInput, setCustomCellInput] = useState<string>("C2");
  const [sheetRecipientMode, setSheetRecipientMode] = useState<"all" | "selected">("all");
  const [sheetSelectedIds, setSheetSelectedIds] = useState<Set<string>>(new Set());
  const [sheetPreviewSearch, setSheetPreviewSearch] = useState<string>("");
  const [showUnlinkedSheetRows, setShowUnlinkedSheetRows] = useState<boolean>(false);
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});
  const templateTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Вкладка 2: Общая рассылка
  const [broadcastText, setBroadcastText] = useState("");
  const [parseMode, setParseMode] = useState<"HTML" | "Markdown" | "">("HTML");

  // Вкладка 3: Опросы (Polls)
  const [pollFolder, setPollFolder] = useState("Неделя 1");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["Да, всё готово", "В процессе", "Нужна помощь"]);
  const [pollIsAnonymous, setPollIsAnonymous] = useState(false);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollPinMessage, setPollPinMessage] = useState(false); // По умолчанию НЕ закрепляем
  const [pollsHistory, setPollsHistory] = useState<PollCampaign[]>([]);
  const [loadingPolls, setLoadingPolls] = useState(false);
  const [selectedPollFolderFilter, setSelectedPollFolderFilter] = useState<string>("ALL");
  const [selectedPollProjectFilter, setSelectedPollProjectFilter] = useState<string>("ALL");
  const [customFolders, setCustomFolders] = useState<string[]>([
    "Неделя 1",
    "Неделя 2",
    "Маркетинг",
    "Отчёты",
  ]);
  const [newFolderName, setNewFolderName] = useState<string>("");
  const [showNewFolderInput, setShowNewFolderInput] = useState<boolean>(false);

  // Модальное окно подтверждения отправки (вместо системного window.confirm)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);

  // Статус отправки и уведомления
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [sendResults, setSendResults] = useState<SendResultItem[] | null>(null);
  const [sentHistory, setSentHistory] = useState<SentBatchHistory[]>([]);
  const [deletingMessages, setDeletingMessages] = useState(false);

  // Загрузка сохраненных настроек из localStorage + запрос чатов с сервера
  useEffect(() => {
    const savedPass = localStorage.getItem("bot500_admin_password") || "";
    const savedToken = localStorage.getItem("bot500_custom_token") || "";
    const savedSheetUrl = localStorage.getItem("bot500_sheet_url") || "";
    const savedTemplate = localStorage.getItem("bot500_sheet_template");
    const savedLocalChats = localStorage.getItem("bot500_local_chats_backup");
    const savedLocalPolls = localStorage.getItem("bot500_local_polls_backup");
    const savedCustomFolders = localStorage.getItem("bot500_poll_folders");
    const savedSentHistory = localStorage.getItem("bot500_sent_history");

    if (savedPass) setAdminPassword(savedPass);
    if (savedToken) setCustomBotToken(savedToken);
    if (savedSheetUrl) setSheetUrl(savedSheetUrl);
    if (savedTemplate) setSheetTemplate(savedTemplate);
    if (savedSentHistory) {
      try {
        setSentHistory(JSON.parse(savedSentHistory));
      } catch {
        // ignore
      }
    }
    if (savedCustomFolders) {
      try {
        const parsedFolders = JSON.parse(savedCustomFolders);
        if (Array.isArray(parsedFolders) && parsedFolders.length > 0) {
          setCustomFolders(parsedFolders);
        }
      } catch {
        // ignore
      }
    }

    let initialBackup: Record<string, StartupChat> = {};
    if (savedLocalChats) {
      try {
        initialBackup = JSON.parse(savedLocalChats);
      } catch {
        // ignore
      }
    }

    let initialPollsBackup: PollCampaign[] = [];
    if (savedLocalPolls) {
      try {
        initialPollsBackup = JSON.parse(savedLocalPolls);
        setPollsHistory(initialPollsBackup);
      } catch {
        // ignore
      }
    }

    fetchChats(savedPass, initialBackup, savedSheetUrl);
    fetchPolls(savedPass, initialPollsBackup, savedToken);
  }, []);

  const pollsHistoryRef = useRef<PollCampaign[]>([]);
  useEffect(() => {
    pollsHistoryRef.current = pollsHistory;
  }, [pollsHistory]);

  // Авто-обновление голосов каждые 5 секунд, пока открыта вкладка "Опросы"
  useEffect(() => {
    if (activeTab !== "polls") return;
    fetchPolls(adminPassword, pollsHistoryRef.current, customBotToken);
    const timer = setInterval(() => {
      fetchPolls(adminPassword, pollsHistoryRef.current, customBotToken);
    }, 5000);
    return () => clearInterval(timer);
  }, [activeTab, adminPassword, customBotToken]);

  // Сохраняем бэкап опросов в localStorage браузера
  useEffect(() => {
    if (pollsHistory.length > 0) {
      localStorage.setItem("bot500_local_polls_backup", JSON.stringify(pollsHistory));
    }
  }, [pollsHistory]);

  async function fetchPolls(
    pass = adminPassword,
    localPolls: PollCampaign[] = pollsHistory,
    tokenOverride = customBotToken
  ) {
    setLoadingPolls(true);
    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": pass,
        },
        body: JSON.stringify({
          action: "sync_votes",
          clientPolls: localPolls,
          botToken: tokenOverride || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.polls)) {
        setPollsHistory(data.polls);
        localStorage.setItem("bot500_local_polls_backup", JSON.stringify(data.polls));
      }
    } catch {
      // ignore
    } finally {
      setLoadingPolls(false);
    }
  }

  async function handleSendPoll() {
    const cleanOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!pollQuestion.trim()) {
      setStatusMessage({ type: "error", text: "Введите вопрос опроса" });
      return;
    }
    if (cleanOptions.length < 2) {
      setStatusMessage({ type: "error", text: "Добавьте минимум 2 варианта ответа" });
      return;
    }

    const targets = Object.values(chats).filter((c) => selectedProjectIds.has(c.projectId));
    if (targets.length === 0) {
      setStatusMessage({ type: "error", text: "Выберите хотя бы один чат стартапа" });
      return;
    }

    setSending(true);
    setSendResults(null);
    setStatusMessage({
      type: "info",
      text: `Отправка опроса в ${targets.length} чатов...`,
    });

    try {
      const res = await fetch("/api/polls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          folder: pollFolder.trim() || "Общие опросы",
          question: pollQuestion.trim(),
          options: cleanOptions,
          isAnonymous: pollIsAnonymous,
          allowsMultipleAnswers: pollMultiple,
          pinMessage: pollPinMessage,
          targets,
          clientPolls: pollsHistory,
          botToken: customBotToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage({ type: "error", text: data.error || "Ошибка отправки опроса" });
        return;
      }

      if (data.polls) {
        setPollsHistory(data.polls);
        localStorage.setItem("bot500_local_polls_backup", JSON.stringify(data.polls));
      }
      setSendResults(data.results || []);
      setStatusMessage({
        type: data.failCount === 0 ? "success" : "info",
        text: `Опрос отправлен! Успешно: ${data.successCount}, Ошибок: ${data.failCount}`,
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Ошибка сети",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleDeletePollCampaign(
    pollCampaignId: string,
    deleteFromTelegram = false
  ) {
    const nextLocal = pollsHistory.filter((p) => p.id !== pollCampaignId);
    setPollsHistory(nextLocal);
    localStorage.setItem("bot500_local_polls_backup", JSON.stringify(nextLocal));

    const res = await fetch("/api/polls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({
        action: "delete",
        pollCampaignId,
        deleteFromTelegram,
        botToken: customBotToken || undefined,
        clientPolls: nextLocal,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setPollsHistory(data.polls || []);
      if (deleteFromTelegram) {
        setStatusMessage({
          type: "success",
          text: "Опрос удалён из чатов Telegram и из истории!",
        });
      }
    }
  }

  async function handleRefreshPollResults() {
    await fetchPolls(adminPassword, pollsHistory, customBotToken);
    setStatusMessage({
      type: "success",
      text: "Голоса и ответы успешно обновлены из Telegram!",
    });
  }

  // Список всех папок опросов (созданные пользователем + из истории опросов)
  const pollFoldersList = useMemo(() => {
    const set = new Set<string>(customFolders);
    for (const p of pollsHistory) {
      if (p.folder?.trim()) {
        set.add(p.folder.trim());
      }
    }
    return Array.from(set);
  }, [pollsHistory, customFolders]);

  function handleCreateFolder() {
    const clean = newFolderName.trim();
    if (!clean) return;
    const next = Array.from(new Set([...customFolders, clean]));
    setCustomFolders(next);
    localStorage.setItem("bot500_poll_folders", JSON.stringify(next));
    setPollFolder(clean);
    setSelectedPollFolderFilter(clean);
    setNewFolderName("");
    setShowNewFolderInput(false);
    setStatusMessage({ type: "success", text: `Папка «${clean}» создана и выбрана!` });
  }

  async function handleDeleteFolder(folderName: string) {
    const remaining = pollFoldersList.filter((f) => f !== folderName);
    const fallback = remaining[0] || "Общие опросы";
    const nextCustom = remaining.length > 0 ? remaining : ["Общие опросы"];

    setCustomFolders(nextCustom);
    localStorage.setItem("bot500_poll_folders", JSON.stringify(nextCustom));

    if (pollFolder === folderName) {
      setPollFolder(fallback);
    }
    if (selectedPollFolderFilter === folderName) {
      setSelectedPollFolderFilter("ALL");
    }

    const nextLocalPolls = pollsHistory.map((p) =>
      (p.folder || "Общие опросы").trim() === folderName ? { ...p, folder: fallback } : p
    );
    setPollsHistory(nextLocalPolls);
    localStorage.setItem("bot500_local_polls_backup", JSON.stringify(nextLocalPolls));

    await fetch("/api/polls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({
        action: "delete_folder",
        folderToDelete: folderName,
        fallbackFolder: fallback,
        clientPolls: nextLocalPolls,
      }),
    }).catch(() => {});

    setStatusMessage({
      type: "info",
      text: `Папка «${folderName}» удалена`,
    });
  }

  async function handleMovePollToFolder(pollCampaignId: string, targetFolder: string) {
    const cleanFolder = targetFolder.trim() || "Общие опросы";
    const nextLocal = pollsHistory.map((p) =>
      p.id === pollCampaignId ? { ...p, folder: cleanFolder } : p
    );
    setPollsHistory(nextLocal);
    localStorage.setItem("bot500_local_polls_backup", JSON.stringify(nextLocal));

    await fetch("/api/polls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({
        action: "move_folder",
        pollCampaignId,
        folder: cleanFolder,
        clientPolls: nextLocal,
      }),
    }).catch(() => {});
  }

  // Отфильтрованные опросы по выбранной папке и по выбранному проекту (стартапу)
  const filteredPollsHistory = useMemo(() => {
    return pollsHistory.filter((p) => {
      const folderName = (p.folder || "Общие опросы").trim();
      if (selectedPollFolderFilter !== "ALL" && folderName !== selectedPollFolderFilter) {
        return false;
      }
      if (selectedPollProjectFilter !== "ALL") {
        return Boolean(p.chats && p.chats[selectedPollProjectFilter]);
      }
      return true;
    });
  }, [pollsHistory, selectedPollFolderFilter, selectedPollProjectFilter]);

  // Сохраняем бэкап чатов в localStorage браузера
  useEffect(() => {
    if (Object.keys(chats).length > 0) {
      localStorage.setItem("bot500_local_chats_backup", JSON.stringify(chats));
    }
  }, [chats]);

  async function fetchChats(
    pass = adminPassword,
    localBackup: Record<string, StartupChat> = {},
    currentSheetUrl = sheetUrl
  ) {
    setLoadingChats(true);
    try {
      const res = await fetch("/api/chats", {
        headers: { "x-admin-password": pass },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage({ type: "error", text: data.error || "Ошибка загрузки чатов" });
        return;
      }

      setHasKv(Boolean(data.hasKv));
      setHasServerBotToken(Boolean(data.hasBotToken));
      if (!currentSheetUrl && data.defaultSheetUrl) {
        setSheetUrl(data.defaultSheetUrl);
      }

      const serverChats: Record<string, StartupChat> = data.chats || {};
      const merged: Record<string, StartupChat> = { ...localBackup, ...serverChats };
      for (const key of Object.keys(merged)) {
        merged[key] = {
          ...merged[key],
          chatId: normalizeDash(merged[key].chatId),
        };
      }
      setChats(merged);

      if (selectedProjectIds.size === 0 && Object.keys(merged).length > 0) {
        setSelectedProjectIds(new Set(Object.keys(merged)));
      }
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Ошибка соединения с сервером",
      });
    } finally {
      setLoadingChats(false);
    }
  }

  // Загрузка и парсинг Google Таблицы
  async function handleLoadSheet(customHeaderRow?: number) {
    if (!sheetUrl.trim()) {
      setStatusMessage({ type: "error", text: "Вставьте ссылку на Google Таблицу" });
      return;
    }

    localStorage.setItem("bot500_sheet_url", sheetUrl.trim());
    setLoadingSheet(true);
    setStatusMessage(null);

    const targetHeaderIdx = (customHeaderRow ?? headerRowNumber) - 1;

    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          headerRowIndex: Math.max(0, targetHeaderIdx),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage({ type: "error", text: data.error || "Не удалось прочитать таблицу" });
        return;
      }

      const grid: string[][] = data.rawGrid || [];
      const cols: SheetColumnInfo[] = data.columns || [];

      setSheetColumns(cols);
      setRawGrid(grid);
      setCustomOverrides({});

      // Авто-определение столбца с ID стартапа
      let detectedIdLetter = idColumnLetter;
      if (cols.length > 0) {
        const idCol = cols.find(
          (c) =>
            c.label.toLowerCase().includes("id") ||
            c.label.toLowerCase().includes("проект") ||
            /^\d{3,7}$/.test(c.sample.trim())
        );
        if (idCol) {
          detectedIdLetter = idCol.letter;
          setIdColumnLetter(idCol.letter);
        }
      }

      // По умолчанию отмечаем все чаты из Базы чатов
      setSheetSelectedIds(new Set(Object.keys(chats)));

      setStatusMessage({
        type: "success",
        text: `Таблица загружена! Строк: ${grid.length}, столбцов: ${cols.length}.`,
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Ошибка загрузки таблицы",
      });
    } finally {
      setLoadingSheet(false);
    }
  }

  // Вставка тега {B} или {C2} в позицию курсора конструктора
  function insertPlaceholderIntoTemplate(placeholder: string) {
    const el = templateTextareaRef.current;
    if (!el) {
      const next = sheetTemplate + placeholder;
      setSheetTemplate(next);
      localStorage.setItem("bot500_sheet_template", next);
      return;
    }

    const start = el.selectionStart ?? sheetTemplate.length;
    const end = el.selectionEnd ?? sheetTemplate.length;
    const next = sheetTemplate.slice(0, start) + placeholder + sheetTemplate.slice(end);
    setSheetTemplate(next);
    localStorage.setItem("bot500_sheet_template", next);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + placeholder.length, start + placeholder.length);
    }, 10);
  }

  function renderTemplateForRow(row: string[], projectId: string, chatTitle: string): string {
    return sheetTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (fullMatch, token: string) => {
      const upper = token.toUpperCase();

      if (upper === "ID") return projectId;
      if (upper === "TITLE") return chatTitle;

      const cellMatch = upper.match(/^([A-Z]+)(\d+)$/);
      if (cellMatch) {
        const colIdx = columnLetterToIndex(cellMatch[1]);
        const rowIdx = parseInt(cellMatch[2], 10) - 1;
        return rawGrid[rowIdx]?.[colIdx] ?? "";
      }

      const colMatch = upper.match(/^([A-Z]+)$/);
      if (colMatch) {
        const colIdx = columnLetterToIndex(colMatch[1]);
        return row[colIdx] ?? "";
      }

      return fullMatch;
    });
  }

  // Строим список получателей на основе БАЗЫ ЧАТОВ + сопоставляем строки из Google Таблицы по ID проекта
  const allSheetItems = useMemo(() => {
    const idColIdx = columnLetterToIndex(idColumnLetter);
    const startIdx = Math.max(0, dataStartRowNumber - 1);

    // Карта строк из Google Таблицы по ID проекта (только цифровые ID)
    const sheetRowsByProjectId = new Map<
      string,
      { rowNumber: number; rowValues: string[] }
    >();

    for (let r = startIdx; r < rawGrid.length; r++) {
      const row = rawGrid[r];
      if (!row || row.every((c) => !c.trim())) continue;

      const rawIdCell = (row[idColIdx] || "").trim();
      const idMatch = rawIdCell.match(/^(\d+)/);
      if (!idMatch) continue; // Пропускаем строки-заголовки вроде "ID"
      const projectId = idMatch[1];

      if (!sheetRowsByProjectId.has(projectId)) {
        sheetRowsByProjectId.set(projectId, { rowNumber: r + 1, rowValues: row });
      }
    }

    const items: Array<{
      rowNumber?: number;
      projectId: string;
      chat?: StartupChat;
      hasSheetRow: boolean;
      text: string;
      rowValues: string[];
    }> = [];

    // 1. Сначала идут все чаты из нашей Базы чатов
    const sortedChats = Object.values(chats).sort((a, b) =>
      a.projectId.localeCompare(b.projectId)
    );

    for (const chat of sortedChats) {
      const sheetMatch = sheetRowsByProjectId.get(chat.projectId);
      const rowValues = sheetMatch?.rowValues || [];
      const generatedText =
        customOverrides[chat.projectId] !== undefined
          ? customOverrides[chat.projectId]
          : renderTemplateForRow(rowValues, chat.projectId, chat.title);

      items.push({
        rowNumber: sheetMatch?.rowNumber,
        projectId: chat.projectId,
        chat,
        hasSheetRow: Boolean(sheetMatch),
        text: generatedText,
        rowValues,
      });
    }

    // 2. Опционально: если включен показ непривязанных строк из таблицы
    if (showUnlinkedSheetRows) {
      for (const [projectId, sheetMatch] of sheetRowsByProjectId.entries()) {
        if (chats[projectId]) continue;
        const generatedText =
          customOverrides[projectId] !== undefined
            ? customOverrides[projectId]
            : renderTemplateForRow(
                sheetMatch.rowValues,
                projectId,
                `${projectId} Marketing Unit`
              );

        items.push({
          rowNumber: sheetMatch.rowNumber,
          projectId,
          chat: undefined,
          hasSheetRow: true,
          text: generatedText,
          rowValues: sheetMatch.rowValues,
        });
      }
    }

    return items;
  }, [
    rawGrid,
    idColumnLetter,
    dataStartRowNumber,
    sheetTemplate,
    chats,
    customOverrides,
    showUnlinkedSheetRows,
  ]);

  useEffect(() => {
    if (allSheetItems.length > 0 && sheetSelectedIds.size === 0) {
      setSheetSelectedIds(new Set(allSheetItems.map((i) => i.projectId)));
    }
  }, [allSheetItems]);

  // Отфильтрованный поиском список в предпросмотре
  const filteredSheetPreviewItems = useMemo(() => {
    if (!sheetPreviewSearch.trim()) return allSheetItems;
    const q = sheetPreviewSearch.toLowerCase();
    return allSheetItems.filter(
      (item) =>
        item.projectId.toLowerCase().includes(q) ||
        (item.chat?.title || "").toLowerCase().includes(q) ||
        item.text.toLowerCase().includes(q)
    );
  }, [allSheetItems, sheetPreviewSearch]);

  // Итоговый список стартапов к отправке из таблицы
  const targetSheetItemsToSend = useMemo(() => {
    return allSheetItems.filter((item) => {
      if (!item.chat?.chatId || !item.text.trim()) return false;
      if (sheetRecipientMode === "selected" && !sheetSelectedIds.has(item.projectId)) {
        return false;
      }
      return true;
    });
  }, [allSheetItems, sheetRecipientMode, sheetSelectedIds]);

  function toggleSheetItemSelection(projectId: string) {
    setSheetRecipientMode("selected");
    setSheetSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function selectAllSheetItems() {
    setSheetSelectedIds(new Set(allSheetItems.map((i) => i.projectId)));
  }

  function deselectAllSheetItems() {
    setSheetRecipientMode("selected");
    setSheetSelectedIds(new Set());
  }

  // Открытие красивого модального окна перед отправкой по таблице
  function handleSendSheetMessages() {
    if (targetSheetItemsToSend.length === 0) {
      setStatusMessage({
        type: "error",
        text: "Нет выбранных привязанных чатов для отправки. Отметьте стартапы галочками или убедитесь, что чаты привязаны к боту.",
      });
      return;
    }

    setConfirmModal({
      title: "Подтверждение рассылки по таблице",
      subtitle: `Будет отправлено индивидуальных сообщений: ${targetSheetItemsToSend.length} шт.`,
      messages: targetSheetItemsToSend.map((item) => ({
        projectId: item.projectId,
        chatId: item.chat!.chatId,
        title: item.chat!.title,
        text: item.text,
      })),
    });
  }

  // Открытие модального окна для отправки одному стартапу
  function handleSendSingleSheetItem(item: {
    projectId: string;
    chat?: StartupChat;
    text: string;
  }) {
    if (!item.chat?.chatId) {
      setStatusMessage({
        type: "error",
        text: `Чат для проекта #${item.projectId} еще не привязан к боту`,
      });
      return;
    }
    if (!item.text.trim()) {
      setStatusMessage({ type: "error", text: "Текст сообщения пуст" });
      return;
    }

    setConfirmModal({
      title: `Отправить сообщение в «${item.chat.title}»?`,
      subtitle: `Проект #${item.projectId} (${item.chat.chatId})`,
      messages: [
        {
          projectId: item.projectId,
          chatId: item.chat.chatId,
          title: item.chat.title,
          text: item.text,
        },
      ],
    });
  }

  // Открытие модального окна для общей рассылки
  function handleSendBroadcast() {
    if (!broadcastText.trim()) {
      setStatusMessage({ type: "error", text: "Введите текст сообщения для рассылки" });
      return;
    }

    const targets = Object.values(chats).filter((c) => selectedProjectIds.has(c.projectId));
    if (targets.length === 0) {
      setStatusMessage({ type: "error", text: "Выберите хотя бы один чат стартапа" });
      return;
    }

    setConfirmModal({
      title: "Отправить общее сообщение?",
      subtitle: `Получателей: ${targets.length} ${targets.length === 1 ? "чат" : "чатов"}`,
      messages: targets.map((chat) => ({
        projectId: chat.projectId,
        chatId: chat.chatId,
        title: chat.title,
        text: broadcastText
          .replace(/\{ID\}/gi, chat.projectId)
          .replace(/\{TITLE\}/gi, chat.title),
      })),
    });
  }

  async function executeSendQueue(messages: QueuedMessage[]) {
    setConfirmModal(null);
    setSending(true);
    setSendResults(null);
    setStatusMessage({
      type: "info",
      text: `Отправка ${messages.length} сообщений... Пожалуйста, подождите.`,
    });

    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          messages,
          parseMode,
          botToken: customBotToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "Ошибка при отправке рассылки",
        });
        return;
      }

      const resultsList: SendResultItem[] = data.results || [];
      setSendResults(resultsList);

      // Сохраняем отправленные сообщения с messageId в историю для возможности удаления в любой момент
      const withMsgIds = resultsList.filter((r) => r.ok && r.messageId);
      if (withMsgIds.length > 0) {
        const newBatch: SentBatchHistory = {
          id: `batch_${Date.now()}`,
          createdAt: new Date().toISOString(),
          items: resultsList,
        };
        setSentHistory((prev) => {
          const next = [newBatch, ...prev].slice(0, 15);
          localStorage.setItem("bot500_sent_history", JSON.stringify(next));
          return next;
        });
      }

      setStatusMessage({
        type: data.failCount === 0 ? "success" : "info",
        text: `Рассылка завершена! Успешно: ${data.successCount}, Ошибок: ${data.failCount}`,
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Ошибка сети при рассылке",
      });
    } finally {
      setSending(false);
    }
  }

  // Удаление (отзыв) отправленных сообщений из Telegram
  async function handleRecallMessages(
    itemsToRecall: Array<{ projectId: string; chatId: string; messageId: number }>,
    batchId?: string
  ) {
    if (itemsToRecall.length === 0) return;
    setDeletingMessages(true);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          action: "delete_messages",
          items: itemsToRecall,
          botToken: customBotToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "Ошибка удаления сообщений",
        });
        return;
      }

      const deletedSet = new Set(
        (data.results || [])
          .filter((r: { ok: boolean }) => r.ok)
          .map((r: { projectId: string; messageId: number }) => `${r.projectId}_${r.messageId}`)
      );

      if (sendResults) {
        setSendResults((prev) =>
          prev
            ? prev.map((item) =>
                item.messageId && deletedSet.has(`${item.projectId}_${item.messageId}`)
                  ? { ...item, deleted: true }
                  : item
              )
            : null
        );
      }

      setSentHistory((prev) => {
        const next = prev
          .map((batch) => {
            if (batchId && batch.id !== batchId) return batch;
            return {
              ...batch,
              items: batch.items.map((item) =>
                item.messageId && deletedSet.has(`${item.projectId}_${item.messageId}`)
                  ? { ...item, deleted: true }
                  : item
              ),
            };
          });
        localStorage.setItem("bot500_sent_history", JSON.stringify(next));
        return next;
      });

      setStatusMessage({
        type: "success",
        text: `Удалено сообщений из чатов Telegram: ${data.deletedCount} из ${itemsToRecall.length}`,
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Ошибка сети при удалении",
      });
    } finally {
      setDeletingMessages(false);
    }
  }

  // Управление чатами
  async function handleAddChat(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectId.trim() || !newChatId.trim()) return;

    const res = await fetch("/api/chats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({
        action: "upsert",
        projectId: newProjectId.trim(),
        chatId: newChatId.trim(),
        title: newChatTitle.trim() || `${newProjectId.trim()} Marketing Unit`,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setChats(data.chats);
      setSelectedProjectIds((prev) => new Set([...prev, newProjectId.trim()]));
      setNewProjectId("");
      setNewChatId("");
      setNewChatTitle("");
      setStatusMessage({ type: "success", text: "Чат добавлен" });
    } else {
      setStatusMessage({ type: "error", text: data.error || "Ошибка" });
    }
  }

  async function handleDeleteChat(projectId: string) {
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({ action: "delete", projectId }),
    });
    const data = await res.json();
    if (data.ok) {
      setChats(data.chats);
      const next = new Set(selectedProjectIds);
      next.delete(projectId);
      setSelectedProjectIds(next);
    }
  }

  async function handleSyncFromTelegram() {
    setLoadingChats(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({
          action: "sync_updates",
          restoreWebhookUrl: `${window.location.origin}/api/webhook`,
          botToken: customBotToken || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMessage({ type: "error", text: data.error || "Ошибка синхронизации" });
        return;
      }
      setChats(data.chats);
      setSelectedProjectIds(new Set(Object.keys(data.chats)));
      setStatusMessage({
        type: "success",
        text: `Синхронизировано! Найдено обновлений из чатов: ${data.foundCount}. Всего чатов: ${
          Object.keys(data.chats).length
        }`,
      });
    } finally {
      setLoadingChats(false);
    }
  }

  async function handleSetWebhook() {
    const webhookUrl = `${window.location.origin}/api/webhook`;
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({
        action: "set_webhook",
        webhookUrl,
        botToken: customBotToken || undefined,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setStatusMessage({
        type: "success",
        text: `Вебхук успешно подключен на ${webhookUrl}! Теперь при добавлении бота или любом сообщении в группе "30211 ..." он автоматически появится в списке.`,
      });
    } else {
      setStatusMessage({ type: "error", text: data.error || "Не удалось установить вебхук" });
    }
  }

  async function handleBulkImport() {
    if (!bulkImportText.trim()) return;
    const lines = bulkImportText.trim().split("\n");
    const items: StartupChat[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/[\s,;|\t]+/);
      if (parts.length >= 2) {
        const projectId = parts[0].trim();
        const chatId = normalizeDash(parts[1]);
        const title = parts.slice(2).join(" ") || `${projectId} Marketing Unit`;
        items.push({
          projectId,
          chatId,
          title,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    if (items.length === 0) {
      setStatusMessage({
        type: "error",
        text: "Не удалось распознать строки. Формат: 30211 -100123456789 Название чата",
      });
      return;
    }

    const res = await fetch("/api/chats", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": adminPassword,
      },
      body: JSON.stringify({ action: "bulk_import", items }),
    });
    const data = await res.json();
    if (data.ok) {
      setChats(data.chats);
      setSelectedProjectIds(new Set(Object.keys(data.chats)));
      setBulkImportText("");
      setStatusMessage({
        type: "success",
        text: `Импортировано ${items.length} чатов!`,
      });
    }
  }

  const chatList = useMemo(() => {
    const all = Object.values(chats).sort((a, b) => a.projectId.localeCompare(b.projectId));
    if (!chatSearch.trim()) return all;
    const q = chatSearch.toLowerCase();
    return all.filter(
      (c) =>
        c.projectId.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.chatId.toLowerCase().includes(q)
    );
  }, [chats, chatSearch]);

  function toggleChatSelection(projectId: string) {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      chatList.forEach((c) => next.add(c.projectId));
      return next;
    });
  }

  function deselectAllFiltered() {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      chatList.forEach((c) => next.delete(c.projectId));
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Верхняя шапка */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              500
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900 leading-tight">
                Bot500 — Рассылки по стартапам
              </h1>
              <p className="text-xs text-slate-500">
                Привязано чатов:{" "}
                <span className="font-semibold text-slate-700">{Object.keys(chats).length}</span> •
                Выбрано:{" "}
                <span className="font-semibold text-indigo-600">{selectedProjectIds.size}</span>
              </p>
            </div>
          </div>

          {/* Навигация по режимам */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("sheet")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "sheet"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Рассылка из Google Таблицы
            </button>
            <button
              onClick={() => setActiveTab("broadcast")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "broadcast"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Send className="w-4 h-4" />
              Общее сообщение
            </button>
            <button
              onClick={() => setActiveTab("polls")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "polls"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Опросы
            </button>
            <button
              onClick={() => setActiveTab("chats")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "chats"
                  ? "bg-white text-indigo-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-4 h-4" />
              База чатов ({Object.keys(chats).length})
            </button>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <Settings className="w-4 h-4" />
            Настройки
          </button>
        </div>

        {/* Выпадающая панель настроек */}
        {showSettings && (
          <div className="border-t border-slate-200 bg-slate-50/80 px-4 sm:px-6 py-4">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Токен Telegram-бота {hasServerBotToken && "(уже задан на сервере ✅)"}
                </label>
                <input
                  type="password"
                  value={customBotToken}
                  onChange={(e) => {
                    setCustomBotToken(e.target.value);
                    localStorage.setItem("bot500_custom_token", e.target.value);
                  }}
                  placeholder={
                    hasServerBotToken
                      ? "Используется TELEGRAM_BOT_TOKEN из Vercel"
                      : "Вставьте токен от @BotFather..."
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Пароль администратора (если задан ADMIN_PASSWORD)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      localStorage.setItem("bot500_admin_password", e.target.value);
                    }}
                    placeholder="Оставьте пустым, если не задавали"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                  />
                  <button
                    onClick={() => fetchChats(adminPassword)}
                    className="px-3 py-2 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-700 shrink-0"
                  >
                    Проверить
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Авто-привязка новых чатов (Webhook)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSetWebhook}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Подключить Webhook к этому домену
                  </button>
                  <button
                    onClick={handleSyncFromTelegram}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Считать getUpdates
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Основной контент */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {statusMessage && (
          <div
            className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
              statusMessage.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : statusMessage.type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-900"
                : "bg-indigo-50 border-indigo-200 text-indigo-900"
            }`}
          >
            <div className="flex items-center gap-2.5 text-sm font-medium">
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-xs opacity-70 hover:opacity-100"
            >
              Закрыть
            </button>
          </div>
        )}

        {/* ВКЛАДКА 1: КОНСТРУКТОР РАССЫЛКИ ИЗ GOOGLE ТАБЛИЦЫ */}
        {activeTab === "sheet" && (
          <div className="space-y-6">
            {/* Шаг 1: Загрузка таблицы */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    1. Подключение Google Таблицы
                  </h2>
                  <p className="text-xs text-slate-500">
                    Вставьте ссылку на вашу таблицу (с доступом «Все, у кого есть ссылка — Читатель»). Если в таблице несколько вкладок — скопируйте ссылку, открыв нужную вкладку (с <code>#gid=...</code>).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-7">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ссылка на Google Таблицу
                  </label>
                  <input
                    type="url"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1ABC.../edit#gid=0"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Строка с заголовками
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={headerRowNumber}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value) || 1);
                      setHeaderRowNumber(val);
                      setDataStartRowNumber(val + 1);
                    }}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-300"
                  />
                </div>

                <div className="md:col-span-3">
                  <button
                    onClick={() => handleLoadSheet()}
                    disabled={loadingSheet}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-sm rounded-xl shadow-sm transition"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingSheet ? "animate-spin" : ""}`} />
                    {loadingSheet ? "Загружаем..." : "Загрузить столбцы и ячейки"}
                  </button>
                </div>
              </div>
            </div>

            {/* Шаг 2: Конструктор: Свой текст + любые столбцы/ячейки */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    2. Конструктор сообщения (Текст + Ячейки)
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      В каком столбце ID проекта (например 30211)?
                    </label>
                    <select
                      value={idColumnLetter}
                      onChange={(e) => setIdColumnLetter(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white font-medium"
                    >
                      {sheetColumns.length > 0 ? (
                        sheetColumns.map((col) => (
                          <option key={col.letter} value={col.letter}>
                            {col.label} {col.sample ? `— прим: "${col.sample.slice(0, 20)}"` : ""}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="A">Столбец A</option>
                          <option value="B">Столбец B</option>
                          <option value="C">Столбец C</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      С какой строки начинаются стартапы?
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={dataStartRowNumber}
                      onChange={(e) =>
                        setDataStartRowNumber(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                    />
                  </div>
                </div>

                {/* Кнопки быстрой вставки столбцов и конкретных ячеек */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Нажмите на столбец, чтобы вставить его значение для каждого стартапа в текст:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => insertPlaceholderIntoTemplate("{ID}")}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 border border-slate-200 transition"
                    >
                      + {"{ID}"} (ID проекта)
                    </button>
                    <button
                      type="button"
                      onClick={() => insertPlaceholderIntoTemplate("{TITLE}")}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 border border-slate-200 transition"
                    >
                      + {"{TITLE}"} (Название чата)
                    </button>

                    {sheetColumns.map((col) => (
                      <button
                        key={col.letter}
                        type="button"
                        onClick={() => insertPlaceholderIntoTemplate(`{${col.letter}}`)}
                        title={col.sample ? `Пример: ${col.sample}` : col.label}
                        className="px-2.5 py-1 text-xs font-medium rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                      >
                        + {`{${col.letter}}`}{" "}
                        <span className="opacity-75">
                          {col.label.replace(`${col.letter} `, "")}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Вставка конкретной фиксированной ячейки (например C2) */}
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs text-slate-500">
                      Или вставить конкретную ячейку (например <code>C2</code>, <code>D1</code>):
                    </span>
                    <input
                      type="text"
                      value={customCellInput}
                      onChange={(e) => setCustomCellInput(e.target.value.toUpperCase())}
                      placeholder="C2"
                      className="w-20 px-2.5 py-1 text-xs rounded-lg border border-slate-300 font-mono uppercase"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (customCellInput.trim()) {
                          insertPlaceholderIntoTemplate(`{${customCellInput.trim().toUpperCase()}}`);
                        }
                      }}
                      className="px-2.5 py-1 text-xs font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700"
                    >
                      Вставить {`{${customCellInput.trim().toUpperCase() || "C2"}}`}
                    </button>
                  </div>
                </div>

                {/* Поле ввода шаблона */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Ваш текст + переменные столбцов/ячеек:
                  </label>
                  <textarea
                    ref={templateTextareaRef}
                    rows={7}
                    value={sheetTemplate}
                    onChange={(e) => {
                      setSheetTemplate(e.target.value);
                      localStorage.setItem("bot500_sheet_template", e.target.value);
                    }}
                    placeholder="Напишите любой текст и вставьте нужные столбцы, например: Привет! Вот ваш отчёт: {B} и комментарий трекера: {D}"
                    className="w-full p-3.5 text-sm rounded-xl border border-slate-300 focus:border-indigo-500 focus:outline-none font-sans leading-relaxed"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">Кому отправлять:</span>
                      <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setSheetRecipientMode("all")}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                            sheetRecipientMode === "all"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Всем из базы чатов ({Object.keys(chats).length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSheetRecipientMode("selected")}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                            sheetRecipientMode === "selected"
                              ? "bg-white text-indigo-600 shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Только выбранным ({sheetSelectedIds.size})
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">Разметка:</span>
                      <select
                        value={parseMode}
                        onChange={(e) =>
                          setParseMode(e.target.value as "HTML" | "Markdown" | "")
                        }
                        className="px-2 py-1 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="HTML">HTML (&lt;b&gt;, &lt;i&gt;, &lt;a&gt;)</option>
                        <option value="Markdown">Markdown</option>
                        <option value="">Без разметки</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSendSheetMessages}
                  disabled={sending || targetSheetItemsToSend.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-sm transition"
                >
                  <Send className="w-4 h-4" />
                  {sending
                    ? "Отправляем рассылку..."
                    : sheetRecipientMode === "all"
                    ? `Отправить ВСЕМ привязанным чатам (${targetSheetItemsToSend.length} шт.)`
                    : `Отправить ВЫБРАННЫМ чатам (${targetSheetItemsToSend.length} шт.)`}
                </button>
              </div>

              {/* Шаг 3: Предпросмотр и выбор конкретных получателей */}
              <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col max-h-[720px]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-indigo-600" />
                      3. Получатели из Базы чатов ({filteredSheetPreviewItems.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Чаты берутся из вашей «Базы чатов», а данные подставляются из таблицы по совпадению ID:
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllSheetItems}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      Выбрать все
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={deselectAllSheetItems}
                      className="font-medium text-slate-500 hover:underline"
                    >
                      Снять все
                    </button>
                    {Object.keys(customOverrides).length > 0 && (
                      <>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setCustomOverrides({})}
                          className="text-rose-600 hover:underline"
                        >
                          Сбросить правки текста
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={sheetPreviewSearch}
                      onChange={(e) => setSheetPreviewSearch(e.target.value)}
                      placeholder="Поиск чата по ID (30211), названию или тексту..."
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300"
                    />
                  </div>
                  {rawGrid.length > 0 && (
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={showUnlinkedSheetRows}
                        onChange={(e) => setShowUnlinkedSheetRows(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      Показать непривязанные из таблицы
                    </label>
                  )}
                </div>

                {allSheetItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-200 rounded-xl text-slate-400">
                    <Users className="w-10 h-10 mb-2 stroke-1" />
                    <p className="text-sm font-medium text-slate-600">
                      В «Базе чатов» пока нет чатов
                    </p>
                    <p className="text-xs mt-1 max-w-sm">
                      Добавьте чаты во вкладке «База чатов» (или включите галочку «Показать непривязанные из таблицы» выше).
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {filteredSheetPreviewItems.map((item) => {
                      const isLinked = Boolean(item.chat?.chatId);
                      const isChecked =
                        sheetRecipientMode === "all" || sheetSelectedIds.has(item.projectId);

                      return (
                        <div
                          key={`${item.rowNumber || "chat"}-${item.projectId}`}
                          className={`p-3.5 rounded-xl border transition ${
                            !isChecked
                              ? "border-slate-200 bg-slate-100/50 opacity-60"
                              : isLinked && item.hasSheetRow
                              ? "border-indigo-200/80 bg-indigo-50/20"
                              : "border-amber-200 bg-amber-50/40"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleSheetItemSelection(item.projectId)}
                                className="flex items-center gap-1.5 text-left"
                              >
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-400 shrink-0" />
                                )}
                                <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-indigo-100 text-indigo-800">
                                  ID: {item.projectId}
                                </span>
                              </button>

                              {item.chat ? (
                                <span className="text-xs font-medium text-emerald-700">
                                  ✓ {item.chat.title}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-amber-700">
                                  ⚠ Чат не в базе
                                </span>
                              )}

                              {rawGrid.length > 0 &&
                                (item.hasSheetRow ? (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                                    Строка #{item.rowNumber} в таблице
                                  </span>
                                ) : (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                                    Нет ID {item.projectId} в таблице
                                  </span>
                                ))}
                            </div>

                            {item.chat && (
                              <button
                                type="button"
                                disabled={sending}
                                onClick={() => handleSendSingleSheetItem(item)}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-300 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 text-slate-700 transition"
                              >
                                <Send className="w-3 h-3" />
                                Отправить только сюда
                              </button>
                            )}
                          </div>

                          <textarea
                            rows={3}
                            value={item.text}
                            onChange={(e) =>
                              setCustomOverrides((prev) => ({
                                ...prev,
                                [item.projectId]: e.target.value,
                              }))
                            }
                            className="w-full p-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:border-indigo-500 focus:outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ВКЛАДКА 2: ОБЩАЯ ИЛИ ВЫБОРОЧНАЯ РАССЫЛКА */}
        {activeTab === "broadcast" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Левая колонка: выбор получателей */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col max-h-[640px]">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-900">
                  Получатели ({selectedProjectIds.size} из {Object.keys(chats).length})
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllFiltered}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Выбрать все
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={deselectAllFiltered}
                    className="text-xs font-medium text-slate-500 hover:underline"
                  >
                    Снять все
                  </button>
                </div>
              </div>

              <div className="relative mb-3">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Поиск по ID (30211) или названию..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {chatList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Список чатов пуст. Перейдите во вкладку «База чатов», чтобы синхронизировать или добавить чаты.
                  </div>
                ) : (
                  chatList.map((chat) => {
                    const checked = selectedProjectIds.has(chat.projectId);
                    return (
                      <label
                        key={chat.projectId}
                        onClick={() => toggleChatSelection(chat.projectId)}
                        className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-slate-50 transition ${
                          checked ? "bg-indigo-50/40" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <div>
                            <div className="text-xs font-semibold text-slate-900">
                              {chat.title}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              ID проекта: {chat.projectId} • chat_id: {chat.chatId}
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Правая колонка: текст общего сообщения */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-slate-900">
                Текст общего сообщения
              </h2>
              <p className="text-xs text-slate-500">
                Вы можете использовать переменные <code>{"{ID}"}</code> (подставит номер проекта, например 30211) и <code>{"{TITLE}"}</code> (полное название чата).
              </p>

              <textarea
                rows={10}
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="Введите сообщение, которое будет отправлено во все выбранные чаты..."
                className="w-full p-3.5 text-sm rounded-xl border border-slate-300 focus:border-indigo-500 focus:outline-none"
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Разметка:</span>
                  <select
                    value={parseMode}
                    onChange={(e) =>
                      setParseMode(e.target.value as "HTML" | "Markdown" | "")
                    }
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="HTML">HTML (&lt;b&gt;жирный&lt;/b&gt;, &lt;a href=&quot;&quot;&gt;)</option>
                    <option value="Markdown">Markdown</option>
                    <option value="">Обычный текст</option>
                  </select>
                </div>

                <button
                  onClick={handleSendBroadcast}
                  disabled={sending || selectedProjectIds.size === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-sm transition"
                >
                  <Send className="w-4 h-4" />
                  {sending
                    ? "Отправка..."
                    : `Отправить в ${selectedProjectIds.size} чатов`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ВКЛАДКА: ОПРОСЫ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ */}
        {activeTab === "polls" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Левая колонка: выбор получателей */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col max-h-[640px]">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    Куда отправить опрос ({selectedProjectIds.size} из {Object.keys(chats).length})
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAllFiltered}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Выбрать все
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      onClick={deselectAllFiltered}
                      className="text-xs font-medium text-slate-500 hover:underline"
                    >
                      Снять все
                    </button>
                  </div>
                </div>

                <div className="relative mb-3">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="Поиск по ID (30211) или названию..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                  {chatList.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Список чатов пуст. Добавьте чаты во вкладке «База чатов».
                    </div>
                  ) : (
                    chatList.map((chat) => {
                      const checked = selectedProjectIds.has(chat.projectId);
                      return (
                        <label
                          key={chat.projectId}
                          onClick={() => toggleChatSelection(chat.projectId)}
                          className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-slate-50 transition ${
                            checked ? "bg-indigo-50/40" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                            <div>
                              <div className="text-xs font-semibold text-slate-900">
                                {chat.title}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                ID проекта: {chat.projectId}
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Правая колонка: создание опроса */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-600" />
                    Конструктор Telegram-опроса
                  </h2>
                  <p className="text-xs text-slate-500">
                    Опрос придет нативной карточкой голосования в выбранные чаты. В вопросе можно использовать <code>{"{ID}"}</code> и <code>{"{TITLE}"}</code>.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Папка опроса
                    </label>
                    <div className="flex gap-1.5">
                      <select
                        value={pollFolder}
                        onChange={(e) => setPollFolder(e.target.value)}
                        className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:border-indigo-500 focus:outline-none font-medium"
                      >
                        {pollFoldersList.map((f) => (
                          <option key={f} value={f}>
                            📁 {f}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewFolderInput(!showNewFolderInput)}
                        title="Создать новую папку"
                        className="px-3 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold shrink-0 flex items-center gap-1 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Папка
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-7">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Вопрос опроса (до 300 символов)
                    </label>
                    <input
                      type="text"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="Например: Отправили ли вы еженедельный отчёт по проекту #{ID}?"
                      className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {showNewFolderInput && (
                  <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 flex items-center gap-2">
                    <Folder className="w-4 h-4 text-indigo-600 shrink-0" />
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateFolder();
                        }
                      }}
                      placeholder="Название новой папки (например: Демо-день, Опрос 12.11)..."
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateFolder}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                    >
                      Создать
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewFolderInput(false)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700">
                      Варианты ответа (от 2 до 10):
                    </label>
                    {pollOptions.length < 10 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions([...pollOptions, ""])}
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Добавить вариант
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-400 w-5 text-center">
                          {idx + 1}.
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...pollOptions];
                            next[idx] = e.target.value;
                            setPollOptions(next);
                          }}
                          placeholder={`Вариант ответа ${idx + 1}`}
                          className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 focus:border-indigo-500 focus:outline-none"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPollOptions(pollOptions.filter((_, i) => i !== idx))
                            }
                            className="p-1.5 text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Настройки опроса */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={!pollIsAnonymous}
                      onChange={(e) => setPollIsAnonymous(!e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span>Открытое голосование (видны имена)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={pollMultiple}
                      onChange={(e) => setPollMultiple(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span>Можно выбрать несколько ответов</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={pollPinMessage}
                      onChange={(e) => setPollPinMessage(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span className="flex items-center gap-1">
                      <Pin className="w-3.5 h-3.5 text-indigo-600" />
                      Закрепить опрос в чате
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={handleSendPoll}
                  disabled={sending || selectedProjectIds.size === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-sm transition"
                >
                  <BarChart3 className="w-4 h-4" />
                  {sending
                    ? "Отправляем опрос..."
                    : `Отправить опрос в выбранные чаты (${selectedProjectIds.size} шт.)`}
                </button>
              </div>
            </div>

            {/* Сводная таблица результатов по отправленным опросам с папками и фильтром по стартапам */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Сводные результаты опросов ({filteredPollsHistory.length} из {pollsHistory.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Фильтруйте опросы по папкам (неделям/темам) или выберите конкретный проект, чтобы увидеть все его ответы:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRefreshPollResults}
                  disabled={loadingPolls}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPolls ? "animate-spin" : ""}`} />
                  Обновить голоса из Telegram
                </button>
              </div>

              {/* Панель папок и фильтра по конкретному стартапу */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                {/* Папки */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-slate-500 flex items-center gap-1 mr-1">
                    <Folder className="w-3.5 h-3.5 text-indigo-600" />
                    Папки:
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedPollFolderFilter("ALL")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      selectedPollFolderFilter === "ALL"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Все папки ({pollsHistory.length})
                  </button>
                  {pollFoldersList.map((folderName) => {
                    const count = pollsHistory.filter(
                      (p) => (p.folder || "Общие опросы").trim() === folderName
                    ).length;
                    const active = selectedPollFolderFilter === folderName;
                    return (
                      <div
                        key={folderName}
                        className={`inline-flex items-center rounded-lg text-xs font-medium transition overflow-hidden ${
                          active
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedPollFolderFilter(folderName)}
                          className="px-2.5 py-1 flex items-center gap-1"
                        >
                          📁 {folderName} ({count})
                        </button>
                        {pollFoldersList.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFolder(folderName);
                            }}
                            title={`Удалить папку «${folderName}»`}
                            className={`pr-2 pl-1 py-1 hover:opacity-100 opacity-60 transition ${
                              active ? "text-white hover:text-rose-200" : "text-slate-400 hover:text-rose-600"
                            }`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowNewFolderInput(true)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 flex items-center gap-1 transition"
                  >
                    <Plus className="w-3 h-3" />
                    Новая папка
                  </button>
                </div>

                {/* Фильтр по конкретному стартапу */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-indigo-600" />
                    Фильтр по проекту:
                  </span>
                  <select
                    value={selectedPollProjectFilter}
                    onChange={(e) => setSelectedPollProjectFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="ALL">Все стартапы ({Object.keys(chats).length})</option>
                    {chatList.map((c) => (
                      <option key={c.projectId} value={c.projectId}>
                        #{c.projectId} — {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredPollsHistory.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
                  По выбранному фильтру пока нет опросов.
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPollsHistory.map((campaign) => {
                    const allChatEntries = Object.values(campaign.chats || {}).sort((a, b) =>
                      a.projectId.localeCompare(b.projectId)
                    );
                    const chatEntries =
                      selectedPollProjectFilter === "ALL"
                        ? allChatEntries
                        : allChatEntries.filter(
                            (c) => c.projectId === selectedPollProjectFilter
                          );
                    const answeredChatsCount = allChatEntries.filter(
                      (c) => c.totalVoterCount > 0 || Object.keys(c.voters || {}).length > 0
                    ).length;

                    return (
                      <div
                        key={campaign.id}
                        className="border border-slate-200 rounded-2xl overflow-hidden"
                      >
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={(campaign.folder || "Общие опросы").trim()}
                                onChange={(e) =>
                                  handleMovePollToFolder(campaign.id, e.target.value)
                                }
                                title="Переместить опрос в другую папку"
                                className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[11px] font-semibold border border-indigo-200 cursor-pointer"
                              >
                                {pollFoldersList.map((f) => (
                                  <option key={f} value={f}>
                                    📁 {f}
                                  </option>
                                ))}
                              </select>
                              <span className="text-sm font-bold text-slate-900">
                                📊 {campaign.question}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              Отправлено: {new Date(campaign.createdAt).toLocaleString("ru-RU")} •
                              Ответили стартапов:{" "}
                              <b className="text-emerald-700">
                                {answeredChatsCount} из {allChatEntries.length}
                              </b>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={deletingMessages}
                              onClick={() => handleDeletePollCampaign(campaign.id, true)}
                              className="text-xs text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                              title="Удалить этот опрос во всех чатах Telegram и из истории"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Отозвать из Telegram
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePollCampaign(campaign.id, false)}
                              className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 cursor-pointer"
                              title="Убрать только из истории админ-панели (в чатах опрос останется)"
                            >
                              Скрыть из истории
                            </button>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 bg-white text-[11px] uppercase text-slate-500">
                                <th className="py-2.5 px-3">Стартап</th>
                                <th className="py-2.5 px-3">Статус</th>
                                <th className="py-2.5 px-3">Голоса по вариантам</th>
                                <th className="py-2.5 px-3">Кто проголосовал</th>
                                <th className="py-2.5 px-3 text-right">В чате ТГ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {chatEntries.map((inst) => {
                                const votersList = Object.values(inst.voters || {});
                                const hasVotes = inst.totalVoterCount > 0 || votersList.length > 0;

                                return (
                                  <tr key={inst.projectId} className="hover:bg-slate-50/70">
                                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                                      <span className="text-indigo-700 font-bold">
                                        #{inst.projectId}
                                      </span>{" "}
                                      {inst.chatTitle}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {hasVotes ? (
                                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-medium text-[11px]">
                                          ✓ Голосов: {inst.totalVoterCount}
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-medium text-[11px]">
                                          ⏳ Нет ответов
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="flex flex-wrap gap-1.5">
                                        {inst.options.map((o, idx) => (
                                          <span
                                            key={idx}
                                            className={`px-2 py-0.5 rounded border text-[11px] ${
                                              o.voterCount > 0
                                                ? "bg-indigo-50 border-indigo-200 text-indigo-800 font-semibold"
                                                : "bg-slate-50 border-slate-200 text-slate-400"
                                            }`}
                                          >
                                            {o.text}: <b>{o.voterCount}</b>
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-600">
                                      {votersList.length > 0 ? (
                                        <div className="space-y-0.5">
                                          {votersList.map((v) => (
                                            <div key={v.userId} className="text-[11px]">
                                              <b>{v.name}</b>
                                              {v.username ? ` (@${v.username})` : ""} →{" "}
                                              <span className="text-indigo-700 font-medium">
                                                {v.optionIds
                                                  .map((id) => inst.options[id]?.text)
                                                  .filter(Boolean)
                                                  .join(", ")}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 text-[11px]">—</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-right">
                                      {inst.messageId ? (
                                        <button
                                          type="button"
                                          disabled={deletingMessages}
                                          onClick={() =>
                                            handleRecallMessages([
                                              {
                                                projectId: inst.projectId,
                                                chatId: inst.chatId,
                                                messageId: inst.messageId!,
                                              },
                                            ])
                                          }
                                          className="text-[11px] text-rose-600 hover:text-rose-800 hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                          title="Удалить опрос только из этого чата Telegram"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                          Удалить из чата
                                        </button>
                                      ) : (
                                        <span className="text-slate-300 text-[11px]">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ВКЛАДКА 3: БАЗА ЧАТОВ И АВТО-ПРИВЯЗКА */}
        {activeTab === "chats" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-6">
              {/* Авто-обнаружение */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <h2 className="text-base font-bold text-slate-900">
                  Автоматическая привязка 40 чатов
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Бот автоматически распознаёт ID проекта по первым цифрам названия группы в Telegram (например, из <b>«30211 Marketing Unit»</b> берется ID <b>30211</b>).
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={handleSetWebhook}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-xl"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Активировать Webhook
                  </button>
                  <button
                    onClick={handleSyncFromTelegram}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-xl"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Подтянуть из getUpdates
                  </button>
                </div>
                {!hasKv && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                    Совет: На Vercel подключите бесплатный <b>Upstash Redis (Vercel KV)</b> во вкладке Storage, чтобы вебхук сохранял новые чаты навсегда. Также вы всегда можете экспортировать/импортировать список ниже.
                  </p>
                )}
              </div>

              {/* Ручное добавление одного чата */}
              <form
                onSubmit={handleAddChat}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3"
              >
                <h3 className="text-sm font-bold text-slate-900">
                  Добавить чат вручную
                </h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      ID проекта (первые цифры)
                    </label>
                    <input
                      type="text"
                      value={newProjectId}
                      onChange={(e) => setNewProjectId(e.target.value)}
                      placeholder="30211"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Telegram chat_id
                    </label>
                    <input
                      type="text"
                      value={newChatId}
                      onChange={(e) => setNewChatId(e.target.value)}
                      placeholder="-1001234567890"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Название чата (необязательно)
                  </label>
                  <input
                    type="text"
                    value={newChatTitle}
                    onChange={(e) => setNewChatTitle(e.target.value)}
                    placeholder="30211 Marketing Unit"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Сохранить чат
                </button>
              </form>

              {/* Массовый импорт / экспорт */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">
                    Массовый импорт / бэкап списка
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      const lines = Object.values(chats)
                        .map((c) => `${c.projectId}\t${c.chatId}\t${c.title}`)
                        .join("\n");
                      navigator.clipboard.writeText(lines);
                      setStatusMessage({
                        type: "success",
                        text: "Список чатов скопирован в буфер обмена!",
                      });
                    }}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Скопировать все
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={bulkImportText}
                  onChange={(e) => setBulkImportText(e.target.value)}
                  placeholder={`По одной строке: ID_проекта chat_id Название\n30211 -100111222333 30211 Marketing Unit\n29203 -100444555666 29203 Marketing Unit`}
                  className="w-full p-2.5 text-xs rounded-lg border border-slate-300 font-mono"
                />
                <button
                  type="button"
                  onClick={handleBulkImport}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-xl"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Импортировать список
                </button>
              </div>
            </div>

            {/* Правая колонка: Таблица всех привязанных чатов */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900">
                  Привязанные чаты стартапов ({Object.keys(chats).length})
                </h2>
                <button
                  onClick={() => fetchChats()}
                  disabled={loadingChats}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingChats ? "animate-spin" : ""}`} />
                  Обновить
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase text-slate-500">
                      <th className="py-2.5 px-3">Выбор</th>
                      <th className="py-2.5 px-3">ID проекта</th>
                      <th className="py-2.5 px-3">Название чата в ТГ</th>
                      <th className="py-2.5 px-3">Telegram chat_id</th>
                      <th className="py-2.5 px-3 text-right">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {chatList.map((chat) => {
                      const isSelected = selectedProjectIds.has(chat.projectId);
                      return (
                        <tr key={chat.projectId} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleChatSelection(chat.projectId)}
                              className="rounded border-slate-300 text-indigo-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-bold text-indigo-700">
                            {chat.projectId}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">
                            {chat.title}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {chat.chatId}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => handleDeleteChat(chat.projectId)}
                              className="text-rose-500 hover:text-rose-700 p-1"
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {chatList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-slate-400">
                          Пока нет привязанных чатов. Добавьте бота в группы и нажмите «Активировать Webhook» или добавьте вручную слева.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Отчет о результатах последней рассылки */}
        {sendResults && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Детальный отчёт по последней отправке ({sendResults.length})
              </h3>
              <div className="flex items-center gap-3">
                {sendResults.some((r) => r.ok && r.messageId && !r.deleted) && (
                  <button
                    type="button"
                    disabled={deletingMessages}
                    onClick={() =>
                      handleRecallMessages(
                        sendResults
                          .filter((r) => r.ok && r.messageId && !r.deleted)
                          .map((r) => ({
                            projectId: r.projectId,
                            chatId: r.chatId,
                            messageId: r.messageId!,
                          }))
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deletingMessages
                      ? "Удаляем из чатов..."
                      : "Удалить всю рассылку из Telegram"}
                  </button>
                )}
                <button
                  onClick={() => setSendResults(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Скрыть отчёт
                </button>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
              {sendResults.map((r, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-bold text-slate-800">#{r.projectId}</span>{" "}
                    <span className="text-slate-600">{r.title}</span>{" "}
                    <span className="text-slate-400 font-mono">({r.chatId})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.deleted ? (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                        🗑 Удалено из чата ТГ
                      </span>
                    ) : r.ok ? (
                      <>
                        <span className="text-emerald-600 font-medium">✓ Отправлено</span>
                        {r.messageId && (
                          <button
                            type="button"
                            disabled={deletingMessages}
                            onClick={() =>
                              handleRecallMessages([
                                {
                                  projectId: r.projectId,
                                  chatId: r.chatId,
                                  messageId: r.messageId!,
                                },
                              ])
                            }
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-50"
                            title="Удалить это сообщение из чата в Telegram"
                          >
                            <Trash2 className="w-3 h-3" />
                            Удалить из ТГ
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-rose-600 font-medium">✕ {r.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* История отправленных сообщений (возможность отозвать/удалить в любой момент) */}
        {(activeTab === "sheet" || activeTab === "broadcast") && sentHistory.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  История отправленных рассылок ({sentHistory.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Если вы отправили сообщение не туда или с опечаткой, нажмите «Удалить из ТГ» — бот мгновенно удалит его из группового чата.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSentHistory([]);
                  localStorage.removeItem("bot500_sent_history");
                }}
                className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                Очистить историю
              </button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {sentHistory.map((batch) => {
                const activeItems = batch.items.filter(
                  (i) => i.ok && i.messageId && !i.deleted
                );
                return (
                  <div
                    key={batch.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                      <span className="text-xs font-semibold text-slate-700">
                        🕒 Отправлено: {new Date(batch.createdAt).toLocaleString("ru-RU")} • Чатов:{" "}
                        {batch.items.length}
                      </span>
                      {activeItems.length > 0 ? (
                        <button
                          type="button"
                          disabled={deletingMessages}
                          onClick={() =>
                            handleRecallMessages(
                              activeItems.map((r) => ({
                                projectId: r.projectId,
                                chatId: r.chatId,
                                messageId: r.messageId!,
                              })),
                              batch.id
                            )
                          }
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Отозвать всю рассылку ({activeItems.length})
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-medium">
                          Все сообщения этой рассылки удалены из ТГ
                        </span>
                      )}
                    </div>

                    <div className="divide-y divide-slate-100 text-xs">
                      {batch.items.map((r, iIdx) => (
                        <div
                          key={iIdx}
                          className="py-1.5 flex items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-bold text-indigo-700">#{r.projectId}</span>{" "}
                            <span className="text-slate-700 font-medium">{r.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.deleted ? (
                              <span className="text-[11px] text-slate-400">
                                🗑 Удалено из чата
                              </span>
                            ) : r.ok && r.messageId ? (
                              <button
                                type="button"
                                disabled={deletingMessages}
                                onClick={() =>
                                  handleRecallMessages(
                                    [
                                      {
                                        projectId: r.projectId,
                                        chatId: r.chatId,
                                        messageId: r.messageId!,
                                      },
                                    ],
                                    batch.id
                                  )
                                }
                                className="flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-3 h-3" />
                                Удалить из ТГ
                              </button>
                            ) : (
                              <span className="text-[11px] text-rose-500">
                                Ошибка: {r.error}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Красивое встроенное модальное окно подтверждения отправки */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          onClick={() => setConfirmModal(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Шапка модалки */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {confirmModal.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {confirmModal.subtitle}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConfirmModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Список получателей и предпросмотр */}
            <div className="p-5 space-y-3 max-h-80 overflow-y-auto bg-slate-50/60">
              <div className="text-xs font-medium text-slate-500">
                Предпросмотр отправки ({confirmModal.messages.length}):
              </div>
              <div className="space-y-2">
                {confirmModal.messages.slice(0, 15).map((m, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-700">
                        #{m.projectId} — {m.title || "Чат стартапа"}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {m.chatId}
                      </span>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap line-clamp-3 font-sans">
                      {m.text}
                    </p>
                  </div>
                ))}
                {confirmModal.messages.length > 15 && (
                  <div className="text-center text-xs text-slate-500 py-1">
                    ...и ещё {confirmModal.messages.length - 15} чатов
                  </div>
                )}
              </div>
            </div>

            {/* Кнопки действий */}
            <div className="px-5 py-3.5 bg-white border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => executeSendQueue(confirmModal.messages)}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition"
              >
                <Send className="w-3.5 h-3.5" />
                Подтвердить и отправить ({confirmModal.messages.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
