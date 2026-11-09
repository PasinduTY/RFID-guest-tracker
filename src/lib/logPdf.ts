import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { formatDay, localDate, localTime } from './dates'
import { MEAL_LABEL, mealLabel, RESULT_LABEL, type Guest, type GuestList, type Meal, type Scan } from './db'

export interface LogPdfInput {
  day: string
  /** One status column per meal, in this order. */
  meals: Meal[]
  /** The uploaded list the day was checked against; every guest on it gets a row. */
  list: GuestList | null
  guests: Guest[]
  /** All scans of the day; scans of other meals are ignored. */
  scans: Scan[]
  exportedAt?: Date
}

type Rgb = [number, number, number]
const GREEN: Rgb = [29, 107, 51]
const AMBER: Rgb = [140, 85, 8]
const GREY: Rgb = [140, 140, 135]

interface MealStatus {
  first?: Scan
  repeats: number
}

/**
 * A4 report laid out like the uploaded Rex list (Rez #, Unit #, Client Name, Occ(s), Qty) with
 * a column per meal saying when each guest was let in, or that they weren't scanned.
 * Scans of tags that aren't on the list follow in a second table.
 */
export function buildLogPdf({ day, meals, list, guests, scans, exportedAt = new Date() }: LogPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const left = 14
  const { width, height } = doc.internal.pageSize

  const mealScans = scans.filter(s => meals.includes(s.meal))
  const onList = new Set(guests.map(g => g.rezNo))
  const status = new Map<string, MealStatus>()
  for (const s of mealScans) {
    if (s.result === 'denied' || !onList.has(s.rezNo)) continue
    const key = `${s.meal}:${s.rezNo}`
    const st = status.get(key) ?? { repeats: 0 }
    if (s.result === 'granted' && !st.first) st.first = s
    else st.repeats++
    status.set(key, st)
  }
  const statusOf = (m: Meal, g: Guest) => status.get(`${m}:${g.rezNo}`)
  const notOnList = mealScans.filter(s => s.result === 'denied' || !onList.has(s.rezNo))

  // Title block, as on the Rex report.
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(20)
  doc.text(list?.property || 'Meal access', left, 16)
  doc.setFont('helvetica', 'normal').setFontSize(11)
  doc.text('Meal Attendance Report - Scan Results', left, 22)
  doc.text(`For: ${formatDay(day)}  ·  ${meals.map(m => MEAL_LABEL[m]).join(' and ')}`, left, 28)
  doc.setFontSize(9).setTextColor(90)
  doc.text(`Exported ${formatDay(localDate(exportedAt))} ${localTime(exportedAt.toISOString())}`, width - left, 16, {
    align: 'right',
  })
  if (list) {
    const source = [`Guest list: ${list.fileName}`, list.generatedAt && `generated ${list.generatedAt}`]
    doc.text(source.filter(Boolean).join('  ·  '), left, 33)
  }

  const summary = meals.map(m => {
    const scanned = guests.filter(g => statusOf(m, g)?.first).length
    const repeats = guests.reduce((n, g) => n + (statusOf(m, g)?.repeats ?? 0), 0)
    const denied = notOnList.filter(s => s.meal === m).length
    return `${MEAL_LABEL[m]}: ${scanned} of ${guests.length} guests scanned · ${guests.length - scanned} not scanned · ${repeats} repeat scans · ${denied} not on list`
  })
  doc.setFontSize(10).setTextColor(20)
  doc.text(summary, left, 40)

  const mealCols = 5
  autoTable(doc, {
    startY: 42 + summary.length * 5,
    head: [['Rez #', 'Unit #', 'Client Name', 'Occ(s)', 'Qty', ...meals.map(m => MEAL_LABEL[m])]],
    body: guests.map(g => [
      g.rezNo,
      g.unitNo,
      g.clientName,
      g.occupants ?? '',
      g.qty ?? '',
      ...meals.map(m => {
        const st = statusOf(m, g)
        if (!st?.first) return st?.repeats ? 'Repeat only' : 'Not scanned'
        return st.repeats ? `${localTime(st.first.scannedAt)} (+${st.repeats} repeat)` : localTime(st.first.scannedAt)
      }),
    ]),
    foot: [
      [
        '',
        '',
        'Total:',
        guests.reduce((n, g) => n + (g.occupants ?? 0), 0),
        guests.reduce((n, g) => n + (g.qty ?? 0), 0),
        ...meals.map(m => `${guests.filter(g => statusOf(m, g)?.first).length} / ${guests.length}`),
      ],
    ],
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6, textColor: 20 },
    headStyles: { fillColor: [31, 111, 74] },
    footStyles: { fillColor: [235, 235, 230], textColor: 20 },
    columnStyles: { 3: { halign: 'center' }, 4: { halign: 'center' } },
    margin: { left, right: left, bottom: 16 },
    didParseCell: cell => {
      if (cell.section !== 'body' || cell.column.index < mealCols) return
      const st = statusOf(meals[cell.column.index - mealCols], guests[cell.row.index])
      cell.cell.styles.textColor = !st?.first ? GREY : st.repeats ? AMBER : GREEN
      if (st?.first) cell.cell.styles.fontStyle = 'bold'
    },
  })
  if (!guests.length) {
    doc.setFontSize(10).setTextColor(...GREY)
    doc.text('No guest list was loaded for this day.', left, docY(doc) + 6)
  }

  if (notOnList.length) {
    let y = docY(doc) + 10
    if (y > height - 40) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20)
    doc.text('Scans not on the guest list', left, y)
    autoTable(doc, {
      startY: y + 2,
      head: [['Time', 'Meal', 'Scanned Unit #', 'Result']],
      body: notOnList.map(s => [localTime(s.scannedAt), mealLabel(s.meal), s.raw.trim(), RESULT_LABEL[s.result]]),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6, textColor: 20 },
      headStyles: { fillColor: [157, 37, 34] },
      margin: { left, right: left, bottom: 16 },
    })
  }

  // Footer on every page.
  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.text(`${list?.property || 'Meal access'} · ${formatDay(day)}`, left, height - 8)
    doc.text(`Page ${p} of ${pages}`, width - left, height - 8, { align: 'right' })
  }
  return doc
}

/** Where the last table ended. */
const docY = (doc: jsPDF) => (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40
