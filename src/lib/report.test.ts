import { existsSync, readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { readSheetRows } from './readFile'
import { parseReport, type Cell } from './report'

/** Same shape as the .xlsx converted from the Rex PDF. */
function sampleRows(): Cell[][] {
  return [
    [
      'Black Rock Tourist Park\r\nfull Meal Attendance Report - Search Product By Date Range\r\nFor: 03 Nov, 2026 to 03 Nov, 2026',
      null, null, null, '03-Nov-26 04:12 PM',
    ],
    ['Date/Product', 'Rez #', 'Unit #', 'Client Name', null, 'Occ(s)', 'Qty'],
    [46329],
    ['Full Board meals'],
    [null, 2026105521, 'NV-214', 'ADOMS, Zachary', null, 1, 7],
    [null, 2026105519, 'NV-212', 'BALA, David', null, 1, 8],
    [null, 2026105502, 'CKD-200', 'DE KLERK, Paul', null, 1, 12],
    [null, null, null, 'Full Board meals Total:', null, 3, 27],
  ]
}

describe('parseReport', () => {
  it('reads guests, title block and totals from the converted report', () => {
    const r = parseReport(sampleRows())
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
    expect(r.property).toBe('Black Rock Tourist Park')
    expect(r.dateFrom).toBe('2026-11-03')
    expect(r.dateTo).toBe('2026-11-03')
    expect(r.generatedAt).toBe('03-Nov-26 04:12 PM')
    expect(r.totals).toEqual({ occupants: 3, qty: 27 })
    expect(r.guests).toHaveLength(3)
    expect(r.guests[2]).toEqual({
      rezNo: '2026105502',
      unitNo: 'CKD-200',
      clientName: 'DE KLERK, Paul',
      occupants: 1,
      qty: 12,
    })
  })

  it('refuses a file whose rows do not add up to the report total', () => {
    const rows = sampleRows()
    rows.splice(5, 1) // a row lost in conversion
    const r = parseReport(rows)
    expect(r.errors[0]).toMatch(/don't match the report total/)
  })

  it('warns about duplicate Rez # and keeps the first row', () => {
    const rows = sampleRows()
    rows.splice(7, 0, [null, 2026105521, 'NV-999', 'SOMEONE, Else', null, 1, 0])
    rows[8] = [null, null, null, 'Total:', null, 4, 27]
    const r = parseReport(rows)
    expect(r.errors).toEqual([])
    expect(r.duplicates).toEqual(['2026105521'])
    expect(r.guests.find(g => g.rezNo === '2026105521')?.unitNo).toBe('NV-214')
  })

  it('falls back to the date line and reads a total written into one cell', () => {
    const rows = sampleRows()
    rows[0] = ['Black Rock Tourist Park']
    rows[2] = ['03-Nov-26']
    rows[7] = ['Full Board meals Total: 3 27']
    const r = parseReport(rows)
    expect(r.errors).toEqual([])
    expect(r.dateFrom).toBe('2026-11-03')
    expect(r.totals).toEqual({ occupants: 3, qty: 27 })
  })

  it('rejects a file without a Rez # column', () => {
    expect(parseReport([['Name', 'Room'], ['A', '1']]).errors[0]).toMatch(/No "Rez #" column/)
  })
})

describe('readSheetRows', () => {
  it('reads the same report from .xlsx and .csv', () => {
    const ws = XLSX.utils.aoa_to_sheet(sampleRows())
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Table 1')

    const xlsx = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const csv = XLSX.utils.sheet_to_csv(ws)

    for (const [data, name] of [[xlsx, 'report.xlsx'], [csv, 'report.csv']] as const) {
      const r = parseReport(readSheetRows(data, name))
      expect(r.errors, name).toEqual([])
      expect(r.guests.map(g => g.rezNo), name).toEqual(['2026105521', '2026105519', '2026105502'])
    }
  })

  // Optional check against a real converted report: REPORT_SAMPLE=path/to/file.xlsx npm test
  const sample = process.env.REPORT_SAMPLE
  it.skipIf(!sample || !existsSync(sample))('parses the real sample file', () => {
    const buf = readFileSync(sample!)
    const r = parseReport(readSheetRows(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), sample!))
    console.log({ guests: r.guests.length, totals: r.totals, errors: r.errors, warnings: r.warnings })
    expect(r.errors).toEqual([])
  })
})
