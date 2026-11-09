import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { formatDay, localDate, localTime } from './dates'
import { MEAL_LABEL, RESULT_LABEL, type Guest, type GuestList, type Meal, type Scan } from './db'

/** One meal of the report, with the list uploaded for that meal. */
export interface LogPdfSection {
  meal: Meal
  /** Every guest on it gets a row. Null when no list was loaded for the meal. */
  list: GuestList | null
  guests: Guest[]
}

export interface LogPdfInput {
  day: string
  /** Breakfast and dinner have separate lists, so each meal is its own section, starting on a new page. */
  sections: LogPdfSection[]
  /** All scans of the day; each section uses its own meal's. */
  scans: Scan[]
  exportedAt?: Date
}

type Rgb = [number, number, number]
const GREEN: Rgb = [29, 107, 51]
const AMBER: Rgb = [140, 85, 8]
const GREY: Rgb = [140, 140, 135]

interface GuestStatus {
  first?: Scan
  repeats: number
}

/**
 * A4 report laid out like the uploaded Rex list (Rez #, Unit #, Client Name, Occ(s), Qty) with a
 * column saying when each guest was let in, or that they weren't scanned. Scans of tags that
 * aren't on the meal's list follow in a second table.
 */
export function buildLogPdf({ day, sections, scans, exportedAt = new Date() }: LogPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const property = sections.find(s => s.list?.property)?.list?.property || 'Meal access'

  sections.forEach((section, i) => {
    if (i > 0) doc.addPage()
    drawSection(doc, section, day, property, scans, exportedAt)
  })

  // Footer on every page.
  const { width, height } = doc.internal.pageSize
  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.text(`${property} · ${formatDay(day)}`, LEFT, height - 8)
    doc.text(`Page ${p} of ${pages}`, width - LEFT, height - 8, { align: 'right' })
  }
  return doc
}

const LEFT = 14

function drawSection(
  doc: jsPDF,
  { meal, list, guests }: LogPdfSection,
  day: string,
  property: string,
  scans: Scan[],
  exportedAt: Date,
) {
  const { width, height } = doc.internal.pageSize
  const top = 16
  const label = MEAL_LABEL[meal]

  const mealScans = scans.filter(s => s.meal === meal)
  const onList = new Set(guests.map(g => g.rezNo))
  const status = new Map<string, GuestStatus>()
  for (const s of mealScans) {
    if (s.result === 'denied' || !onList.has(s.rezNo)) continue
    const st = status.get(s.rezNo) ?? { repeats: 0 }
    if (s.result === 'granted' && !st.first) st.first = s
    else st.repeats++
    status.set(s.rezNo, st)
  }
  const notOnList = mealScans.filter(s => s.result === 'denied' || !onList.has(s.rezNo))
  const scanned = guests.filter(g => status.get(g.rezNo)?.first).length
  const repeats = guests.reduce((n, g) => n + (status.get(g.rezNo)?.repeats ?? 0), 0)

  // Title block, as on the Rex report.
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(20)
  doc.text(property, LEFT, top)
  doc.setFont('helvetica', 'normal').setFontSize(11)
  doc.text(`${label} Attendance Report - Scan Results`, LEFT, top + 6)
  doc.text(`For: ${formatDay(day)}`, LEFT, top + 12)
  doc.setFontSize(9).setTextColor(90)
  doc.text(`Exported ${formatDay(localDate(exportedAt))} ${localTime(exportedAt.toISOString())}`, width - LEFT, top, {
    align: 'right',
  })
  const source = list
    ? [`${label} list: ${list.fileName}`, list.generatedAt && `generated ${list.generatedAt}`].filter(Boolean).join('  ·  ')
    : `No ${label.toLowerCase()} list was loaded for this day.`
  doc.text(source, LEFT, top + 17)

  doc.setFontSize(10).setTextColor(20)
  doc.text(
    `${scanned} of ${guests.length} guests scanned · ${guests.length - scanned} not scanned · ${repeats} repeat scans · ${notOnList.length} not on list`,
    LEFT,
    top + 24,
  )

  const statusCol = 5
  autoTable(doc, {
    startY: top + 27,
    head: [['Rez #', 'Unit #', 'Client Name', 'Occ(s)', 'Qty', label]],
    body: guests.map(g => {
      const st = status.get(g.rezNo)
      const cell = !st?.first
        ? 'Not scanned'
        : st.repeats
          ? `${localTime(st.first.scannedAt)} (+${st.repeats} repeat)`
          : localTime(st.first.scannedAt)
      return [g.rezNo, g.unitNo, g.clientName, g.occupants ?? '', g.qty ?? '', cell]
    }),
    foot: [
      [
        '',
        '',
        'Total:',
        guests.reduce((n, g) => n + (g.occupants ?? 0), 0),
        guests.reduce((n, g) => n + (g.qty ?? 0), 0),
        `${scanned} / ${guests.length}`,
      ],
    ],
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6, textColor: 20 },
    headStyles: { fillColor: [31, 111, 74] },
    footStyles: { fillColor: [235, 235, 230], textColor: 20 },
    columnStyles: { 3: { halign: 'center' }, 4: { halign: 'center' } },
    margin: { left: LEFT, right: LEFT, bottom: 16 },
    didParseCell: cell => {
      if (cell.section !== 'body' || cell.column.index !== statusCol) return
      const st = status.get(guests[cell.row.index].rezNo)
      cell.cell.styles.textColor = !st?.first ? GREY : st.repeats ? AMBER : GREEN
      if (st?.first) cell.cell.styles.fontStyle = 'bold'
    },
  })

  if (notOnList.length) {
    let y = docY(doc) + 10
    if (y > height - 40) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20)
    doc.text(`Scans not on the ${label.toLowerCase()} list`, LEFT, y)
    autoTable(doc, {
      startY: y + 2,
      head: [['Time', 'Scanned Unit #', 'Result']],
      body: notOnList.map(s => [localTime(s.scannedAt), s.raw.trim(), RESULT_LABEL[s.result]]),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6, textColor: 20 },
      headStyles: { fillColor: [157, 37, 34] },
      margin: { left: LEFT, right: LEFT, bottom: 16 },
    })
  }
}

/** Where the last table ended. */
const docY = (doc: jsPDF) => (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40
