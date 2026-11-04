import * as XLSX from 'xlsx'
import type { Cell } from './report'

/** First sheet of an .xlsx/.xls/.csv file as rows of cells. */
export function readSheetRows(data: ArrayBuffer | string, fileName: string): Cell[][] {
  const isCsv = /\.csv$/i.test(fileName) || typeof data === 'string'
  // CSV: keep every value as text, so Rez # and dates are never reinterpreted.
  const wb = isCsv
    ? XLSX.read(typeof data === 'string' ? data : new TextDecoder().decode(data), { type: 'string', raw: true })
    : XLSX.read(data, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false })
}

export async function readReportFile(file: File): Promise<Cell[][]> {
  return readSheetRows(await file.arrayBuffer(), file.name)
}
