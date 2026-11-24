/**
 * Форматирует дату из YYYY-MM-DD в DD.MM.YYYY
 */
export function formatDateRu(dateStr: string): string {
  if (!dateStr) return dateStr;
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3 || parts[0].length !== 4) return dateStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

/**
 * Форматирует дату из YYYY-MM-DD в DD.MM
 */
export function formatShortDateRu(dateStr: string): string {
  if (!dateStr) return dateStr;
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3 || parts[0].length !== 4) return dateStr;
  return `${parts[2]}.${parts[1]}`;
}
