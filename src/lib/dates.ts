const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar date as YYYY-MM-DD (never UTC, so 07:00 breakfast stays on the right day). */
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function localTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "2026-11-03" -> "03 Nov 2026" */
export function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const month = MONTHS[m - 1]
  return `${pad(d)} ${month[0].toUpperCase()}${month.slice(1)} ${y}`
}

/**
 * Parses the date formats Rex prints: "03 Nov, 2026", "03 Nov 2026" and "03-Nov-26".
 * Returns YYYY-MM-DD, or null when the text is not one of those.
 */
export function parseReportDate(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[,\s-]+(\d{2}|\d{4})$/)
  if (!m) return null
  const month = MONTHS.indexOf(m[2].toLowerCase())
  if (month < 0) return null
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return `${year}-${pad(month + 1)}-${pad(Number(m[1]))}`
}

/** Excel stores dates as days since 1899-12-30. */
export function excelSerialToDay(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
