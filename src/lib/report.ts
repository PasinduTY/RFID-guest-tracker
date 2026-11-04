import { excelSerialToDay, parseReportDate } from './dates'

/** One guest row from the Rex "Meal Attendance Report". */
export interface ReportGuest {
  rezNo: string
  unitNo: string
  clientName: string
  occupants: number | null
  qty: number | null
}

export interface ParsedReport {
  property: string | null
  dateFrom: string | null
  dateTo: string | null
  generatedAt: string | null
  /** Unique by Rez #; the first row wins when a number repeats. */
  guests: ReportGuest[]
  /** Sums over every guest row read, duplicates included, to compare with the report's own totals. */
  sums: { rows: number; occupants: number; qty: number }
  /** Sum of all "Total:" lines in the report, or null when the file has none. */
  totals: { occupants: number; qty: number } | null
  duplicates: string[]
  /** Problems that make the list unsafe to use. */
  errors: string[]
  /** Problems the guard should see but may accept. */
  warnings: string[]
}

export type Cell = string | number | boolean | Date | null | undefined

/** Header text -> lowercase letters only, so "Rez #" and "rez#" both become "rez". */
const key = (v: Cell) => cellText(v).toLowerCase().replace(/[^a-z]/g, '')

export function cellText(v: Cell): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return String(v)
  if (v instanceof Date) return v.toISOString()
  return String(v).trim()
}

function cellNumber(v: Cell): number | null {
  if (typeof v === 'number') return v
  const t = cellText(v)
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

const REZ = /^\d{6,}$/
const RANGE = /For:\s*(\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})\s+to\s+(\d{1,2}\s+[A-Za-z]{3},?\s+\d{4})/i
const GENERATED = /\b(\d{1,2}-[A-Za-z]{3}-\d{2}\s+\d{1,2}:\d{2}\s*[AP]M)\b/i
const TOTAL = /total\s*:/i

/**
 * Reads the report as a grid of cells (one array per spreadsheet row).
 * Works for the .xlsx converted from the Rex PDF and for the same sheet saved as .csv:
 * columns are found by their header text, and a guest row is any row whose Rez # cell is all digits.
 */
export function parseReport(rows: Cell[][]): ParsedReport {
  const result: ParsedReport = {
    property: null,
    dateFrom: null,
    dateTo: null,
    generatedAt: null,
    guests: [],
    sums: { rows: 0, occupants: 0, qty: 0 },
    totals: null,
    duplicates: [],
    errors: [],
    warnings: [],
  }

  const headerAt = rows.findIndex(r => r.some(c => key(c) === 'rez'))
  if (headerAt < 0) {
    result.errors.push('No "Rez #" column found. Is this the Meal Attendance Report?')
    return result
  }

  const header = rows[headerAt].map(key)
  const col = {
    rez: header.indexOf('rez'),
    unit: header.indexOf('unit'),
    name: header.indexOf('clientname'),
    occ: header.indexOf('occs'),
    qty: header.indexOf('qty'),
  }
  if (col.name < 0) result.warnings.push('No "Client Name" column found. Names will be blank.')

  // Title block above the header: property name, date range and print time.
  const titleText = rows.slice(0, headerAt).flat().map(cellText).filter(Boolean).join('\n')
  result.property = titleText.split(/\r?\n/)[0]?.trim() || null
  const range = titleText.match(RANGE)
  if (range) {
    result.dateFrom = parseReportDate(range[1])
    result.dateTo = parseReportDate(range[2])
  }
  result.generatedAt = (titleText + '\n' + rows[headerAt].map(cellText).join(' ')).match(GENERATED)?.[1] ?? null

  const seen = new Set<string>()
  let totalOcc = 0
  let totalQty = 0
  let totalLines = 0

  for (const row of rows.slice(headerAt + 1)) {
    const rez = cellText(row[col.rez])

    if (REZ.test(rez)) {
      const occupants = col.occ >= 0 ? cellNumber(row[col.occ]) : null
      const qty = col.qty >= 0 ? cellNumber(row[col.qty]) : null
      result.sums.rows++
      result.sums.occupants += occupants ?? 0
      result.sums.qty += qty ?? 0
      if (seen.has(rez)) {
        result.duplicates.push(rez)
        continue
      }
      seen.add(rez)
      result.guests.push({
        rezNo: rez,
        unitNo: col.unit >= 0 ? cellText(row[col.unit]) : '',
        // The name sits in merged cells; if the converter shifted it one column right, look there too.
        clientName: col.name >= 0 ? cellText(row[col.name]) || cellText(row[col.name + 1]) : '',
        occupants,
        qty,
      })
      continue
    }

    const totalCell = row.findIndex(c => TOTAL.test(cellText(c)))
    if (totalCell >= 0) {
      let occ = col.occ >= 0 ? cellNumber(row[col.occ]) : null
      let qty = col.qty >= 0 ? cellNumber(row[col.qty]) : null
      if (occ === null) {
        // Converter put "Total: 44 309" into one cell.
        const nums = cellText(row[totalCell]).split(TOTAL)[1]?.match(/\d+/g)?.map(Number) ?? []
        occ = nums[0] ?? null
        qty = qty ?? nums[1] ?? null
      }
      totalOcc += occ ?? 0
      totalQty += qty ?? 0
      totalLines++
      continue
    }

    // The date line under the header ("03-Nov-26", or an Excel date number) when the title had no range.
    if (!result.dateFrom) {
      const first = row[0]
      const day =
        typeof first === 'number' && first > 30_000 && first < 80_000
          ? excelSerialToDay(first)
          : parseReportDate(cellText(first))
      if (day) result.dateFrom = result.dateTo = day
    }
  }

  if (totalLines > 0) result.totals = { occupants: totalOcc, qty: totalQty }

  if (result.sums.rows === 0) {
    result.errors.push('No guest rows found under the "Rez #" column.')
  } else if (!result.totals) {
    result.warnings.push('The file has no "Total:" line, so the guest count could not be checked.')
  } else {
    if (result.totals.occupants !== result.sums.occupants) {
      result.errors.push(
        `Occupants read (${result.sums.occupants}) don't match the report total (${result.totals.occupants}). Some rows may be missing or misread.`,
      )
    }
    if (col.qty >= 0 && result.totals.qty !== result.sums.qty) {
      result.warnings.push(`Qty read (${result.sums.qty}) doesn't match the report total (${result.totals.qty}).`)
    }
  }

  if (result.duplicates.length) {
    result.warnings.push(`${result.duplicates.length} Rez # appear more than once; the first row of each is used.`)
  }
  const odd = result.guests.filter(g => g.rezNo.length !== 10).length
  if (odd) result.warnings.push(`${odd} Rez # aren't 10 digits long.`)
  if (!result.dateFrom) result.warnings.push("The report date couldn't be found in the file.")

  return result
}
