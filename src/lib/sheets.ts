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

  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    throw new Error(
      "Не удалось распознать ID таблицы в ссылке. Пример ссылки: https://docs.google.com/spreadsheets/d/1ABC.../edit"
    );
  }

  const spreadsheetId = idMatch[1];
  const gidMatch = trimmed.match(/[#&?]gid=(\d+)/);
  const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : "";

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gidParam}`;
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

  const response = await fetch(csvUrl, {
    cache: "no-store",
  });

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

  const rawGrid = parsed.data.map((row) => row.map((cell) => (cell ?? "").trim()));
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
