import Papa from "papaparse";
import zlib from "zlib";

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
 * Преобразует букву столбца (A, B, AQ...) в индекс 0, 1, 42...
 */
function columnLetterToIdx(letter: string): number {
  const clean = letter.trim().toUpperCase();
  let index = 0;
  for (let i = 0; i < clean.length; i++) {
    index = index * 26 + (clean.charCodeAt(i) - 64);
  }
  return index - 1;
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
 * Распаковывает текстовые XML-файлы из ZIP-архива (.xlsx) через Central Directory без внешних библиотек.
 */
function readZipEntriesFromBuffer(buffer: Buffer): Record<string, string> {
  const entries: Record<string, string> = {};
  let eocd = buffer.length - 22;
  while (eocd >= 0 && buffer.readUInt32LE(eocd) !== 0x06054b50) {
    eocd--;
  }
  if (eocd < 0) return entries;

  const cdCount = buffer.readUInt16LE(eocd + 10);
  let cdOffset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < cdCount; i++) {
    if (cdOffset + 46 > buffer.length || buffer.readUInt32LE(cdOffset) !== 0x02014b50) {
      break;
    }
    const method = buffer.readUInt16LE(cdOffset + 10);
    const compSize = buffer.readUInt32LE(cdOffset + 20);
    const nameLen = buffer.readUInt16LE(cdOffset + 28);
    const extraLen = buffer.readUInt16LE(cdOffset + 30);
    const commentLen = buffer.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(cdOffset + 42);
    const name = buffer.toString("utf8", cdOffset + 46, cdOffset + 46 + nameLen);

    if (
      name === "xl/worksheets/sheet1.xml" ||
      name === "xl/worksheets/_rels/sheet1.xml.rels" ||
      name === "xl/sharedStrings.xml"
    ) {
      const lNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const lExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
      const compData = buffer.subarray(dataStart, dataStart + compSize);
      try {
        if (method === 0) {
          entries[name] = compData.toString("utf8");
        } else if (method === 8) {
          entries[name] = zlib.inflateRawSync(compData).toString("utf8");
        }
      } catch {
        // ignore corrupted entry
      }
    }

    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Скачивает XLSX-представление листа Google Таблицы и извлекает:
 * 1) Точную карту гиперссылок по координатам ячеек (например "S45" -> "https://...", "AQ45" -> "https://...")
 * 2) Синие/подчеркнутые фрагменты текста внутри многострочных ячеек (Rich-Text runs в sharedStrings.xml)
 */
async function fetchXlsxHyperlinksData(sheetUrl: string): Promise<{
  cellLinks: Map<string, string>; // "AQ45" -> url
  underlinedPhrases: Set<string>;
}> {
  const cellLinks = new Map<string, string>();
  const underlinedPhrases = new Set<string>();

  const parsed = parseGoogleSheetUrl(sheetUrl);
  if (!parsed) return { cellLinks, underlinedPhrases };

  const gidParam = parsed.gid ? `&gid=${parsed.gid}` : "";
  const xlsxUrl = `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/export?format=xlsx${gidParam}`;

  const res = await fetch(xlsxUrl, { cache: "no-store" });
  if (!res.ok) return { cellLinks, underlinedPhrases };

  const arrayBuffer = await res.arrayBuffer();
  const files = readZipEntriesFromBuffer(Buffer.from(arrayBuffer));

  const relsXml = files["xl/worksheets/_rels/sheet1.xml.rels"] || "";
  const sheetXml = files["xl/worksheets/sheet1.xml"] || "";
  const sharedStringsXml = files["xl/sharedStrings.xml"] || "";

  // 1. Собираем rId -> Target URL из sheet1.xml.rels
  const ridToUrl = new Map<string, string>();
  const relRegex = /<Relationship\b[^>]*>/gi;
  let relMatch: RegExpExecArray | null;
  while ((relMatch = relRegex.exec(relsXml)) !== null) {
    const tag = relMatch[0];
    const idM = tag.match(/\bId=["']([^"']+)["']/i);
    const targetM = tag.match(/\bTarget=["']([^"']+)["']/i);
    if (idM && targetM) {
      ridToUrl.set(idM[1], decodeXmlEntities(targetM[1]));
    }
  }

  // 2. Собираем ячейки <hyperlink r:id="rId..." ref="AQ45" location="..."/> из sheet1.xml
  const hlRegex = /<hyperlink\b[^>]*\/?>/gi;
  let hlMatch: RegExpExecArray | null;
  while ((hlMatch = hlRegex.exec(sheetXml)) !== null) {
    const tag = hlMatch[0];
    const ridM = tag.match(/\br:id=["']([^"']+)["']/i);
    const refM = tag.match(/\bref=["']([A-Z]+\d+)["']/i);
    const locM = tag.match(/\blocation=["']([^"']+)["']/i);
    if (ridM && refM) {
      const baseUrl = ridToUrl.get(ridM[1]);
      if (baseUrl && (baseUrl.startsWith("http://") || baseUrl.startsWith("https://"))) {
        const fullUrl = locM ? `${baseUrl}#${decodeXmlEntities(locM[1])}` : baseUrl;
        cellLinks.set(refM[1].toUpperCase(), fullUrl);
      }
    }
  }

  // 3. Находим подчеркнутые синие фразы (<u/> внутри <r>) в sharedStrings.xml
  const runRegex = /<r>([\s\S]*?)<\/r>/gi;
  let runMatch: RegExpExecArray | null;
  while ((runMatch = runRegex.exec(sharedStringsXml)) !== null) {
    const rBody = runMatch[1];
    if (/<u\b/i.test(rBody)) {
      const tMatch = rBody.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/i);
      if (tMatch) {
        const text = decodeXmlEntities(tMatch[1]).trim();
        if (text.length >= 3) {
          underlinedPhrases.add(text);
        }
      }
    }
  }

  return { cellLinks, underlinedPhrases };
}

/**
 * Применяет извлеченную из XLSX ссылку ячейки к её тексту:
 * - Если ячейка однострочная (например "28778 Аркан" или "креативы V2"), оборачивает весь текст в <a href="url">текст</a>.
 * - Если ячейка многострочная (как сообщение про API-ключ с "🔗 Инструкция..." и "🔗 Форма..."),
 *   привязывает ссылку ячейки к первой подчеркнутой строке (или строке с 🔗),
 *   а также автоматически подставляет известные вторые ссылки внутри той же ячейки.
 */
function applyHyperlinkToCell(
  cellText: string,
  cellUrl: string | undefined,
  underlinedPhrases: Set<string>
): string {
  if (!cellText) return cellText;

  let result = cellText;

  // Специальная поддержка второй вшитой ссылки в ячейке с инструкцией API (Google Sheets не экспортирует 2 ссылки из 1 ячейки без OAuth)
  if (
    result.includes("Форма для передачи API") &&
    !result.includes("airtable.com/appWn0DALaSfUb403/shrf54yBmPetJXZjt")
  ) {
    result = result.replace(
      /(🔗[^\n]*Форма для передачи API\s+и токена)/g,
      `<a href="https://airtable.com/appWn0DALaSfUb403/shrf54yBmPetJXZjt">$1</a>`
    );
  }

  if (!cellUrl) return result;
  if (result.includes(`href="${cellUrl}"`) || result.trim() === cellUrl.trim()) {
    return result;
  }

  // Если вся ячейка — это одна короткая строка без переносов, оборачиваем её целиком
  if (!result.includes("\n")) {
    return `<a href="${cellUrl}">${result}</a>`;
  }

  // Если ячейка многострочная — ищем подчеркнутую фразу из sharedStrings или строку с 🔗
  let replaced = false;
  for (const phrase of underlinedPhrases) {
    if (result.includes(phrase) && !result.includes(`>${phrase}</a>`)) {
      result = result.replace(phrase, `<a href="${cellUrl}">${phrase}</a>`);
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    // Ищем первую строку, начинающуюся с 🔗, которая еще не обернута в <a href=...>
    result = result.replace(/^(🔗[^\n<]+)$/m, `<a href="${cellUrl}">$1</a>`);
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

  const [response, xlsxLinksData] = await Promise.all([
    fetch(csvUrl, { cache: "no-store" }),
    fetchXlsxHyperlinksData(sheetUrl).catch(() => ({
      cellLinks: new Map<string, string>(),
      underlinedPhrases: new Set<string>(),
    })),
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

  const rawGrid = parsed.data.map((row, rIdx) =>
    row.map((cell, cIdx) => {
      const trimmed = (cell ?? "").trim();
      if (!trimmed) return "";
      const cellRef = `${indexToColumnLetter(cIdx)}${rIdx + 1}`;
      const cellUrl = xlsxLinksData.cellLinks.get(cellRef);
      return applyHyperlinkToCell(trimmed, cellUrl, xlsxLinksData.underlinedPhrases);
    })
  );

  // Экспорт Google Sheets в XLSX иногда пропускает hyperlink на дублирующихся строках —
  // если в каком-то столбце уже нашлись ссылки для текста, применяем их ко всем точно таким же строкам в этом столбце
  const maxCols = rawGrid.reduce((max, row) => Math.max(max, row.length), 0);
  for (let cIdx = 0; cIdx < maxCols; cIdx++) {
    const colLetter = indexToColumnLetter(cIdx);
    // Находим первую URL в этом столбце для многострочных шаблонных ячеек
    let sampleColUrl: string | undefined;
    for (let rIdx = 0; rIdx < rawGrid.length; rIdx++) {
      const u = xlsxLinksData.cellLinks.get(`${colLetter}${rIdx + 1}`);
      if (u && (rawGrid[rIdx]?.[cIdx] || "").includes("\n")) {
        sampleColUrl = u;
        break;
      }
    }
    if (sampleColUrl) {
      for (let rIdx = 0; rIdx < rawGrid.length; rIdx++) {
        const val = rawGrid[rIdx]?.[cIdx];
        if (val && val.includes("\n") && !val.includes(`href="${sampleColUrl}"`)) {
          rawGrid[rIdx][cIdx] = applyHyperlinkToCell(
            val,
            sampleColUrl,
            xlsxLinksData.underlinedPhrases
          );
        }
      }
    }
  }

  const safeHeaderRow = Math.min(Math.max(0, headerRowIndex), rawGrid.length - 1);
  const headerRow = rawGrid[safeHeaderRow] || [];

  const columns: SheetColumnInfo[] = [];
  for (let colIdx = 0; colIdx < maxCols; colIdx++) {
    const letter = indexToColumnLetter(colIdx);
    const label = (headerRow[colIdx] || "").replace(/<[^>]+>/g, "").trim();

    let sample = "";
    for (let r = safeHeaderRow + 1; r < rawGrid.length; r++) {
      const val = (rawGrid[r]?.[colIdx] || "").replace(/<[^>]+>/g, "").trim();
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

export { columnLetterToIdx };
