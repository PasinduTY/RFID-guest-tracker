import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { formatDay, localDate, localTime } from './dates'
import { mealLabel, MEAL_LABEL, RESULT_LABEL, type Meal, type Scan, type ScanResult } from './db'

export interface LogPdfInfo {
  day: string
  meal?: Meal
  result?: ScanResult
  property?: string | null
  exportedAt?: Date
}

const RESULT_COLOR: Record<ScanResult, [number, number, number]> = {
  granted: [29, 107, 51],
  repeat: [122, 74, 7],
  denied: [157, 37, 34],
}

/** A4 report of the given scans: title, filters, per-meal counts, then one table row per scan. */
export function buildLogPdf(scans: Scan[], info: LogPdfInfo): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const exportedAt = info.exportedAt ?? new Date()
  const left = 14

  doc.setFont('helvetica', 'bold').setFontSize(16)
  doc.text(`Meal access log · ${formatDay(info.day)}`, left, 18)

  const filters = [
    info.meal ? MEAL_LABEL[info.meal] : 'Lunch and dinner',
    info.result ? `${RESULT_LABEL[info.result]} only` : 'All results',
    info.property,
  ].filter(Boolean)
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(90)
  doc.text(filters.join('  ·  '), left, 25)

  const meals = [...new Set(scans.map(s => s.meal))]
  const summary = meals.map(m => {
    const count = (r: ScanResult) => scans.filter(s => s.meal === m && s.result === r).length
    return `${mealLabel(m)}: ${count('granted')} granted · ${count('repeat')} repeat · ${count('denied')} denied`
  })
  doc.setTextColor(30)
  doc.text(summary.length ? summary : ['No scans.'], left, 32)

  autoTable(doc, {
    startY: 34 + summary.length * 5,
    head: [['Time', 'Meal', 'Rez #', 'Unit #', 'Client name', 'Occ', 'Result', 'First scanned']],
    body: scans.map(s => [
      localTime(s.scannedAt),
      mealLabel(s.meal),
      s.rezNo,
      s.unitNo || '-',
      s.clientName || '-',
      s.occupants ?? '',
      RESULT_LABEL[s.result],
      s.firstScannedAt ? localTime(s.firstScannedAt) : '',
    ]),
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: [31, 111, 74] },
    columnStyles: { 0: { cellWidth: 14 }, 2: { font: 'courier' }, 5: { halign: 'center' } },
    margin: { left, right: left, bottom: 16 },
    didParseCell: cell => {
      if (cell.section === 'body' && cell.column.index === 6) {
        cell.cell.styles.textColor = RESULT_COLOR[scans[cell.row.index].result]
        cell.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // Footer on every page.
  const pages = doc.getNumberOfPages()
  const { width, height } = doc.internal.pageSize
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.text(`Exported ${formatDay(localDate(exportedAt))} ${localTime(exportedAt.toISOString())}`, left, height - 8)
    doc.text(`Page ${p} of ${pages}`, width - left, height - 8, { align: 'right' })
  }
  return doc
}
