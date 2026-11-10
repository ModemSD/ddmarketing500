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
  ok: boolean;
  error?: string;
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
  const [activeTab, setActiveTab] = useState<"sheet" | "broadcast" | "chats">("sheet");

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
  const [headerRowNumber, setHeaderRowNumber] = useState<number>(1); // 1-based для пользователя
  const [dataStartRowNumber, setDataStartRowNumber] = useState<number>(2); // 1-based
  const [sheetColumns, setSheetColumns] = useState<SheetColumnInfo[]>([]);
  const [rawGrid, setRawGrid] = useState<string[][]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [idColumnLetter, setIdColumnLetter] = useState<string>("A");
  const [sheetTemplate, setSheetTemplate] = useState<string>(
    "Привет, команда проекта #{ID}!\n\nВаш шаблон отчёта:\n{B}"
  );
  const [customCellInput, setCustomCellInput] = useState<string>("C2");
  const [onlySelectedInSheet, setOnlySelectedInSheet] = useState<boolean>(false);
  const [customOverrides, setCustomOverrides] = useState<Record<string, string>>({});
  const templateTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Вкладка 2: Общая рассылка
  const [broadcastText, setBroadcastText] = useState("");
  const [parseMode, setParseMode] = useState<"HTML" | "Markdown" | "">("HTML");

  // Статус отправки и уведомления
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [sendResults, setSendResults] = useState<SendResultItem[] | null>(null);

  // Загрузка сохраненных настроек из localStorage + запрос чатов с сервера
  useEffect(() => {
    const savedPass = localStorage.getItem("bot500_admin_password") || "";
    const savedToken = localStorage.getItem("bot500_custom_token") || "";
    const savedSheetUrl = localStorage.getItem("bot500_sheet_url") || "";
    const savedTemplate = localStorage.getItem("bot500_sheet_template");
    const savedLocalChats = localStorage.getItem("bot500_local_chats_backup");

    if (savedPass) setAdminPassword(savedPass);
    if (savedToken) setCustomBotToken(savedToken);
    if (savedSheetUrl) setSheetUrl(savedSheetUrl);
    if (savedTemplate) setSheetTemplate(savedTemplate);

    let initialBackup: Record<string, StartupChat> = {};
    if (savedLocalChats) {
      try {
        initialBackup = JSON.parse(savedLocalChats);
      } catch {
        // ignore
      }
    }

    fetchChats(savedPass, initialBackup, savedSheetUrl);
  }, []);

  // Сохраняем бэкап чатов в localStorage браузера на случай если на Vercel ещё не подключен KV
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
      const merged = { ...localBackup, ...serverChats };
      setChats(merged);

      // Если это первая загрузка — выбираем все чаты по умолчанию
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

      setSheetColumns(data.columns || []);
      setRawGrid(data.rawGrid || []);
      setCustomOverrides({});

      // Авто-определение столбца с ID стартапа (ищем столбец где значения похожи на 5-значные ID или совпадают с чатами)
      const cols: SheetColumnInfo[] = data.columns || [];
      if (cols.length > 0) {
        const idCol = cols.find(
          (c) =>
            c.label.toLowerCase().includes("id") ||
            c.label.toLowerCase().includes("проект") ||
            /^\d{3,7}$/.test(c.sample.trim())
        );
        if (idCol) {
          setIdColumnLetter(idCol.letter);
        }
      }

      setStatusMessage({
        type: "success",
        text: `Таблица загружена! Строк: ${data.rawGrid?.length || 0}, столбцов: ${
          data.columns?.length || 0
        }.`,
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

  // Вычисление текста сообщения для строки таблицы:
  // Поддерживает:
  // - {ID} — ID стартапа
  // - {TITLE} — Название чата в ТГ
  // - {A}, {B}, {AA} — значение из соответствующего столбца текущей строки стартапа
  // - {B2}, {C15} — значение из конкретной фиксированной ячейки таблицы (столбец + номер строки)
  function renderTemplateForRow(row: string[], projectId: string, chatTitle: string): string {
    return sheetTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (fullMatch, token: string) => {
      const upper = token.toUpperCase();

      if (upper === "ID") return projectId;
      if (upper === "TITLE") return chatTitle;

      // Проверка на конкретную ячейку вида B2, C10, AA5
      const cellMatch = upper.match(/^([A-Z]+)(\d+)$/);
      if (cellMatch) {
        const colIdx = columnLetterToIndex(cellMatch[1]);
        const rowIdx = parseInt(cellMatch[2], 10) - 1;
        return rawGrid[rowIdx]?.[colIdx] ?? "";
      }

      // Проверка на букву столбца текущей строки вида A, B, C, AA
      const colMatch = upper.match(/^([A-Z]+)$/);
      if (colMatch) {
        const colIdx = columnLetterToIndex(colMatch[1]);
        return row[colIdx] ?? "";
      }

      return fullMatch;
    });
  }

  // Формируем предпросмотр индивидуальных сообщений по таблице
  const sheetPreviewItems = useMemo(() => {
    if (!rawGrid.length) return [];
    const idColIdx = columnLetterToIndex(idColumnLetter);
    const startIdx = Math.max(0, dataStartRowNumber - 1);

    const items: Array<{
      rowNumber: number;
      projectId: string;
      chat?: StartupChat;
      text: string;
      rowValues: string[];
    }> = [];

    for (let r = startIdx; r < rawGrid.length; r++) {
      const row = rawGrid[r];
      if (!row || row.every((c) => !c.trim())) continue;

      const rawIdCell = (row[idColIdx] || "").trim();
      // Извлекаем первые цифры из ячейки ID (на случай если в ячейке написано "30211 Marketing" или просто "30211")
      const idMatch = rawIdCell.match(/^(\d+)/);
      const projectId = idMatch ? idMatch[1] : rawIdCell;
      if (!projectId) continue;

      if (onlySelectedInSheet && !selectedProjectIds.has(projectId)) {
        continue;
      }

      const chat = chats[projectId];
      const generatedText =
        customOverrides[projectId] !== undefined
          ? customOverrides[projectId]
          : renderTemplateForRow(row, projectId, chat?.title || `${projectId} Marketing Unit`);

      items.push({
        rowNumber: r + 1,
        projectId,
        chat,
        text: generatedText,
        rowValues: row,
      });
    }

    return items;
  }, [
    rawGrid,
    idColumnLetter,
    dataStartRowNumber,
    sheetTemplate,
    chats,
    onlySelectedInSheet,
    selectedProjectIds,
    customOverrides,
  ]);

  // Отправка сообщений по таблице
  async function handleSendSheetMessages() {
    const readyToSend = sheetPreviewItems.filter(
      (item) => item.chat?.chatId && item.text.trim().length > 0
    );

    if (readyToSend.length === 0) {
      setStatusMessage({
        type: "error",
        text: "Нет готовых сообщений для привязанных чатов. Проверьте, что чаты привязаны и столбец ID выбран верно.",
      });
      return;
    }

    if (
      !window.confirm(
        `Отправить индивидуальные сообщения в ${readyToSend.length} чатов стартапов?`
      )
    ) {
      return;
    }

    await executeSendQueue(
      readyToSend.map((item) => ({
        projectId: item.projectId,
        chatId: item.chat!.chatId,
        title: item.chat!.title,
        text: item.text,
      }))
    );
  }

  // Отправка общей/выборочной рассылки
  async function handleSendBroadcast() {
    if (!broadcastText.trim()) {
      setStatusMessage({ type: "error", text: "Введите текст сообщения для рассылки" });
      return;
    }

    const targets = Object.values(chats).filter((c) => selectedProjectIds.has(c.projectId));
    if (targets.length === 0) {
      setStatusMessage({ type: "error", text: "Выберите хотя бы один чат стартапа" });
      return;
    }

    if (
      !window.confirm(
        `Отправить сообщение в выбранные чаты (${targets.length} шт.)?`
      )
    ) {
      return;
    }

    await executeSendQueue(
      targets.map((chat) => ({
        projectId: chat.projectId,
        chatId: chat.chatId,
        title: chat.title,
        text: broadcastText
          .replace(/\{ID\}/gi, chat.projectId)
          .replace(/\{TITLE\}/gi, chat.title),
      }))
    );
  }

  async function executeSendQueue(
    messages: Array<{ projectId: string; chatId: string; title?: string; text: string }>
  ) {
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

      setSendResults(data.results || []);
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
      // Поддержка формата: "30211 -1001234567890 30211 Marketing Unit" или через запятую/табуляцию
      const parts = trimmed.split(/[\s,;|\t]+/);
      if (parts.length >= 2) {
        const projectId = parts[0].trim();
        const chatId = parts[1].trim();
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
                Привязано чатов: <span className="font-semibold text-slate-700">{Object.keys(chats).length}</span> • Выбрано:{" "}
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

      {/* Уведомление о статусе */}
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
                    rows={8}
                    value={sheetTemplate}
                    onChange={(e) => {
                      setSheetTemplate(e.target.value);
                      localStorage.setItem("bot500_sheet_template", e.target.value);
                    }}
                    placeholder="Напишите любой текст и вставьте нужные столбцы, например: Привет! Вот ваш отчёт: {B} и комментарий трекера: {D}"
                    className="w-full p-3.5 text-sm rounded-xl border border-slate-300 focus:border-indigo-500 focus:outline-none font-sans leading-relaxed"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onlySelectedInSheet}
                        onChange={(e) => setOnlySelectedInSheet(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      Отправлять только отмеченным галочкой во вкладке «База чатов» ({selectedProjectIds.size})
                    </label>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">Форматирование:</span>
                      <select
                        value={parseMode}
                        onChange={(e) =>
                          setParseMode(e.target.value as "HTML" | "Markdown" | "")
                        }
                        className="px-2 py-1 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="HTML">HTML (&lt;b&gt;, &lt;i&gt;, &lt;a&gt;)</option>
                        <option value="Markdown">Markdown</option>
                        <option value="">Без разметки (обычный текст)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSendSheetMessages}
                  disabled={sending || sheetPreviewItems.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-sm transition"
                >
                  <Send className="w-4 h-4" />
                  {sending
                    ? "Отправляем рассылку..."
                    : `Отправить индивидуальные сообщения (${
                        sheetPreviewItems.filter((i) => i.chat?.chatId && i.text.trim()).length
                      } чатов)`}
                </button>
              </div>

              {/* Шаг 3: Предпросмотр сообщений по каждому стартапу */}
              <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col max-h-[680px]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-indigo-600" />
                      3. Предпросмотр перед отправкой ({sheetPreviewItems.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Вы можете проверить или подправить текст для любого конкретного стартапа прямо здесь:
                    </p>
                  </div>
                  {Object.keys(customOverrides).length > 0 && (
                    <button
                      onClick={() => setCustomOverrides({})}
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      Сбросить ручные правки
                    </button>
                  )}
                </div>

                {sheetPreviewItems.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-200 rounded-xl text-slate-400">
                    <FileSpreadsheet className="w-10 h-10 mb-2 stroke-1" />
                    <p className="text-sm font-medium text-slate-600">
                      Загрузите Google Таблицу сверху
                    </p>
                    <p className="text-xs mt-1 max-w-sm">
                      Здесь сразу появится предпросмотр того, какое сообщение получит каждый стартап по своему ID.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {sheetPreviewItems.map((item) => {
                      const isLinked = Boolean(item.chat?.chatId);
                      return (
                        <div
                          key={`${item.rowNumber}-${item.projectId}`}
                          className={`p-3.5 rounded-xl border ${
                            isLinked
                              ? "border-slate-200 bg-slate-50/60"
                              : "border-amber-200 bg-amber-50/40"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-indigo-100 text-indigo-800">
                                ID: {item.projectId}
                              </span>
                              <span className="text-xs text-slate-500">
                                Строка #{item.rowNumber}
                              </span>
                              {item.chat ? (
                                <span className="text-xs font-medium text-emerald-700">
                                  ✓ {item.chat.title}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-amber-700">
                                  ⚠ Чат с ID {item.projectId} еще не привязан к боту
                                </span>
                              )}
                            </div>
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
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Детальный отчёт по последней отправке ({sendResults.length})
              </h3>
              <button
                onClick={() => setSendResults(null)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Скрыть отчёт
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 text-xs">
              {sendResults.map((r, idx) => (
                <div key={idx} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">#{r.projectId}</span>{" "}
                    <span className="text-slate-600">{r.title}</span>{" "}
                    <span className="text-slate-400 font-mono">({r.chatId})</span>
                  </div>
                  <div>
                    {r.ok ? (
                      <span className="text-emerald-600 font-medium">✓ Отправлено</span>
                    ) : (
                      <span className="text-rose-600 font-medium">✕ {r.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

