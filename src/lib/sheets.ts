import Papa from "papaparse";

/**
 * Преобразует индекс столбца (0, 1, 2...) в букву Excel/Google Sheets (A, B, C... Z, AA, AB...)
 */
export function indexToColumnLetter(index: number): string {
  let temp = index;
  let letter = "";
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Извлекает spreadsheetId и gid из ссылки на Google Таблицу.
 */
function parseGoogleSheetUrl(sheetUrl: string): { spreadsheetId: string; gid?: string } | null {
  const trimmed = sheetUrl.trim();
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);
  return {
    spreadsheetId: idMatch[1],
    gid: gidMatch ? gidMatch[1] : undefined,
  };
}

/**
 * Преобразует обычную ссылку на Google Таблицу в ссылку экспорта CSV.
 * Поддерживает выбор конкретного листа (gid).
 */
export function buildGoogleSheetCsvUrl(sheetUrl: string): string {
  const trimmed = sheetUrl.trim();
  if (!trimmed) {
    throw new Error("Ссылка на Google Таблицу пуста");
  }

  if (trimmed.includes("/export?format=csv") || trimmed.endsWith(".csv")) {
    return trimmed;
  }

  const parsed = parseGoogleSheetUrl(trimmed);
  if (!parsed) {
    throw new Error(
      "Не удалось распознать ID таблицы в ссылке. Пример ссылки: https://docs.google.com/spreadsheets/d/1ABC.../edit"
    );
  }

  const gidParam = parsed.gid ? `&gid=${parsed.gid}` : "";
  return `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/export?format=csv${gidParam}`;
}

/**
 * Разворачивает редирект Google (https://www.google.com/url?q=...) в чистую прямую ссылку
 */
function unwrapGoogleRedirectUrl(rawHref: string): string {
  const decoded = rawHref
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
  try {
    const u = new URL(decoded);
    if (
      (u.hostname === "www.google.com" || u.hostname === "google.com") &&
      u.pathname === "/url"
    ) {
      const q = u.searchParams.get("q") || u.searchParams.get("url");
      if (q) return q;
    }
  } catch {
    // ignore
  }
  return decoded;
}

/**
 * Извлекает все гиперссылки (<a href="...">текст</a>) из HTML-представления Google Таблицы (/htmlview)
 * и возвращает список пар { label, url }, чтобы автоматически подставить их в текст ячеек CSV
 * в формате HTML для Telegram: <a href="url">label</a>.
 */
async function fetchSheetHyperlinksMap(
  sheetUrl: string
): Promise<Array<{ label: string; url: string }>> {
  const parsed = parseGoogleSheetUrl(sheetUrl);
  if (!parsed) return [];

  const linksMap = new Map<string, string>();

  const collectLinksFromHtml = (html: string) => {
    const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(html)) !== null) {
      const rawHref = match[1];
      const innerHtml = match[2];
      const cleanUrl = unwrapGoogleRedirectUrl(rawHref);
      if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
        continue;
      }
      // Убираем вложенные теги внутри <a> и декодируем базовые сущности
      const cleanLabel = innerHtml
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      if (cleanLabel && cleanLabel.length >= 2 && cleanLabel !== cleanUrl) {
        linksMap.set(cleanLabel, cleanUrl);
      }
    }
  };

  const gidQuery = parsed.gid ? `?gid=${parsed.gid}&single=true` : "";
  const htmlViewUrl = `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/htmlview${gidQuery}`;
  const gvizHtmlUrl = `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/gviz/tq?tqx=out:html${
    parsed.gid ? `&gid=${parsed.gid}` : ""
  }`;

  await Promise.allSettled([
    fetch(htmlViewUrl, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => {
        if (html) collectLinksFromHtml(html);
      }),
    fetch(gvizHtmlUrl, { cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => {
        if (html) collectLinksFromHtml(html);
      }),
  ]);

  // Сортируем от самых длинных фраз к коротким, чтобы не заменять подстроку раньше полной фразы
  return Array.from(linksMap.entries())
    .map(([label, url]) => ({ label, url }))
    .sort((a, b) => b.label.length - a.label.length);
}

/**
 * Подставляет найденные гиперссылки <a href="url">label</a> в текст ячейки CSV
 */
function injectHyperlinksIntoCellText(
  cellText: string,
  links: Array<{ label: string; url: string }>
): string {
  if (!cellText || links.length === 0) return cellText;
  let result = cellText;

  for (const { label, url } of links) {
    // Если эта ссылка уже обернута в <a ...>, пропускаем
    if (!result.includes(label) || result.includes(`href="${url}"`)) {
      continue;
    }
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Допускаем небольшую разницу в количестве пробелов (например двойной пробел "API  и токена")
    const flexibleWhitespacePattern = escapedLabel.replace(/\s+/g, "\\s+");
    const regex = new RegExp(`(?<!["'>])${flexibleWhitespacePattern}(?!</a>)`, "g");
    result = result.replace(regex, (matchedText) => `<a href="${url}">${matchedText}</a>`);
  }

  return result;
}

export interface SheetColumnInfo {
  letter: string; // "A", "B", "C"...
  label: string; // Заголовок из выбранной строки шапки (или первая непустая ячейка)
  sample: string; // Пример значения из первой строки данных
}

export interface ParsedSheetData {
  columns: SheetColumnInfo[];
  rawGrid: string[][]; // Полная сетка [rowIndex][colIndex] для обращения к любым ячейкам (например B2) и строкам
  csvUrl: string;
}

export async function fetchGoogleSheetData(
  sheetUrl: string,
  headerRowIndex = 0
): Promise<ParsedSheetData> {
  const csvUrl = buildGoogleSheetCsvUrl(sheetUrl);

  const [response, hyperlinks] = await Promise.all([
    fetch(csvUrl, { cache: "no-store" }),
    fetchSheetHyperlinksMap(sheetUrl).catch(() => []),
  ]);

  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить таблицу (HTTP ${response.status}). Убедитесь, что доступ открыт: «Все, у кого есть ссылка, могут просматривать».`
    );
  }

  const csvText = await response.text();
  if (csvText.trim().startsWith("<!DOCTYPE html>") || csvText.includes("<html")) {
    throw new Error(
      "Вместо данных таблицы получена страница входа Google. Откройте доступ к таблице по ссылке («Читатель»)."
    );
  }

  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: false,
  });

  if (!parsed.data || parsed.data.length === 0) {
    throw new Error("Таблица пуста");
  }

  const rawGrid = parsed.data.map((row) =>
    row.map((cell) => injectHyperlinksIntoCellText((cell ?? "").trim(), hyperlinks))
  );
  const maxCols = rawGrid.reduce((max, row) => Math.max(max, row.length), 0);

  const safeHeaderRow = Math.min(Math.max(0, headerRowIndex), rawGrid.length - 1);
  const headerRow = rawGrid[safeHeaderRow] || [];

  const columns: SheetColumnInfo[] = [];
  for (let colIdx = 0; colIdx < maxCols; colIdx++) {
    const letter = indexToColumnLetter(colIdx);
    const label = (headerRow[colIdx] || "").trim();

    let sample = "";
    for (let r = safeHeaderRow + 1; r < rawGrid.length; r++) {
      const val = (rawGrid[r]?.[colIdx] || "").trim();
      if (val) {
        sample = val.length > 60 ? val.slice(0, 60) + "…" : val;
        break;
      }
    }

    columns.push({
      letter,
      label: label ? `${letter} (${label})` : `Столбец ${letter}`,
      sample,
    });
  }

  return {
    columns,
    rawGrid,
    csvUrl,
  };
}
