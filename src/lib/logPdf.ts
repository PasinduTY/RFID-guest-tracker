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

/** What happened at one meal, measured against that meal's uploaded list. */
export interface MealStats {
  /** Per Rez #: when the guest was first let in, and how many repeat scans followed. */
  status: Map<string, GuestStatus>
  /** Scans of tags that aren't on the list. */
  notOnList: Scan[]
  guests: number
  occupants: number
  /** Guests let in at least once. */
  tookMeal: number
  occupantsTookMeal: number
  repeats: number
  firstScan: string | null
  lastScan: string | null
}

export function mealStats({ meal, guests }: LogPdfSection, scans: Scan[]): MealStats {
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
  const took = guests.filter(g => status.get(g.rezNo)?.first)
  const times = mealScans.map(s => s.scannedAt).sort()
  return {
    status,
    notOnList: mealScans.filter(s => s.result === 'denied' || !onList.has(s.rezNo)),
    guests: guests.length,
    occupants: guests.reduce((n, g) => n + (g.occupants ?? 0), 0),
    tookMeal: took.length,
    occupantsTookMeal: took.reduce((n, g) => n + (g.occupants ?? 0), 0),
    repeats: guests.reduce((n, g) => n + (status.get(g.rezNo)?.repeats ?? 0), 0),
    firstScan: times[0] ?? null,
    lastScan: times.at(-1) ?? null,
  }
}

/**
 * A4 report laid out like the uploaded Rex list (Rez #, Unit #, Client Name, Occ(s), Qty) with a
 * column saying when each guest was let in, or that they weren't scanned. Scans of tags that
 * aren't on the meal's list follow in a second table.
 */
export function buildLogPdf({ day, sections, scans, exportedAt = new Date() }: LogPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const property = propertyOf(sections)
  const meals = sections.map(s => MEAL_LABEL[s.meal]).join(' and ')
  const title = `${meals} Attendance Report - Scan Results`
  const combined = sections.length > 1

  const titleBottom = drawTitle(doc, property, title, day, exportedAt)
  if (!combined) {
    drawSection(doc, sections[0], titleBottom + 5, scans, false)
    drawFooters(doc, property, day)
    return doc
  }

  // Several meals: page 1 says so and lists where each meal starts, each meal opens with its own
  // heading, and every page's header and footer name the meal it belongs to.
  const contentsY = titleBottom + 7
  const startPage: number[] = []
  sections.forEach((section, i) => {
    if (i > 0) doc.addPage()
    startPage.push(doc.getNumberOfPages())
    drawSection(doc, section, i === 0 ? contentsY + 12 : RUNNING_HEADER_Y + 12, scans, true)
  })

  doc.setPage(1)
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(20)
  const contents = sections.map((s, i) => `${MEAL_LABEL[s.meal]} (page ${startPage[i]})`).join('  ·  ')
  doc.text(`This report covers ${sections.length} meals: ${contents}`, LEFT, contentsY)

  const mealOfPage = (p: number) => sections[startPage.findLastIndex(start => start <= p)].meal
  const { width } = doc.internal.pageSize
  for (let p = 2; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
    doc.text(`${property} · ${title} · ${formatDay(day)}`, LEFT, RUNNING_HEADER_Y)
    doc.text(`${MEAL_LABEL[mealOfPage(p)]} section`, width - LEFT, RUNNING_HEADER_Y, { align: 'right' })
  }
  drawFooters(doc, property, day, p => `${MEAL_LABEL[mealOfPage(p)]} section`)
  return doc
}

/** Small header line on every page after the first of a multi-meal report. */
const RUNNING_HEADER_Y = 10

const MEAL_COLOR: Record<Meal, Rgb> = { breakfast: [140, 85, 8], dinner: [21, 79, 143] }

/** One-page overview: per meal, how many guests were on the list, took the meal, and didn't. */
export function buildSummaryPdf({ day, sections, scans, exportedAt = new Date() }: LogPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const property = propertyOf(sections)
  const top = drawTitle(doc, property, 'Meal Summary', day, exportedAt)

  const stats = sections.map(s => mealStats(s, scans))
  const percent = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '-')
  const time = (iso: string | null) => (iso ? localTime(iso) : '-')
  const hasList = (i: number) => !!sections[i].list
  // Counts against a list mean nothing for a meal that had no list, so those show "-".
  const row = (label: string, value: (st: MealStats, i: number) => string | number, needsList = true) => [
    label,
    ...stats.map((st, i) => (needsList && !hasList(i) ? '-' : value(st, i))),
  ]

  autoTable(doc, {
    startY: top + 4,
    head: [['', ...sections.map(s => MEAL_LABEL[s.meal])]],
    body: [
      row('No. of guests', (st, i) => (hasList(i) ? st.guests : 'No list loaded'), false),
      row('No. of guests who took the meal', st => st.tookMeal),
      row("No. of guests who didn't take the meal", st => st.guests - st.tookMeal),
      row('Attendance', st => percent(st.tookMeal, st.guests)),
      row('No. of occupants', st => st.occupants),
      row('Occupants who took the meal', st => st.occupantsTookMeal),
      row('Repeat scans', st => st.repeats),
      row('Scans not on the list (denied)', st => st.notOnList.length, false),
      row('First scan', st => time(st.firstScan), false),
      row('Last scan', st => time(st.lastScan), false),
      row('Guest list', (_, i) => sections[i].list?.fileName ?? '-'),
    ],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 11, cellPadding: 3, textColor: 20 },
    headStyles: { fillColor: [31, 111, 74], fontSize: 12 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
    margin: { left: LEFT, right: LEFT, bottom: 16 },
    didParseCell: cell => {
      if (cell.section !== 'body' || cell.column.index === 0) return
      // The three headline rows stand out.
      if (cell.row.index <= 2) cell.cell.styles.fontSize = 14
      if (cell.row.index === 1) cell.cell.styles.textColor = GREEN
      if (cell.row.index === 2) cell.cell.styles.textColor = AMBER
    },
  })

  drawFooters(doc, property, day)
  return doc
}

const LEFT = 14

const propertyOf = (sections: LogPdfSection[]) => sections.find(s => s.list?.property)?.list?.property || 'Meal access'

/** Title block, as on the Rex report. Returns the y just below it. */
function drawTitle(doc: jsPDF, property: string, title: string, day: string, exportedAt: Date): number {
  const { width } = doc.internal.pageSize
  const top = 16
  doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(20)
  doc.text(property, LEFT, top)
  doc.setFont('helvetica', 'normal').setFontSize(11)
  doc.text(title, LEFT, top + 6)
  doc.text(`For: ${formatDay(day)}`, LEFT, top + 12)
  doc.setFontSize(9).setTextColor(90)
  doc.text(`Exported ${formatDay(localDate(exportedAt))} ${localTime(exportedAt.toISOString())}`, width - LEFT, top, {
    align: 'right',
  })
  return top + 12
}

function drawFooters(doc: jsPDF, property: string, day: string, extra?: (page: number) => string) {
  const { width, height } = doc.internal.pageSize
  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120)
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.text([property, formatDay(day), extra?.(p)].filter(Boolean).join(' · '), LEFT, height - 8)
    doc.text(`Page ${p} of ${pages}`, width - LEFT, height - 8, { align: 'right' })
  }
}

/**
 * One meal's guest table, starting at `top`. With `heading`, it opens with the meal's name in
 * large type (used when the report holds several meals).
 */
function drawSection(doc: jsPDF, section: LogPdfSection, top: number, scans: Scan[], heading: boolean) {
  const { meal, list, guests } = section
  const { width, height } = doc.internal.pageSize
  const label = MEAL_LABEL[meal]
  const { status, notOnList, tookMeal: scanned, repeats } = mealStats(section, scans)

  let y = top
  if (heading) {
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...MEAL_COLOR[meal])
    doc.text(label, LEFT, y)
    doc.setDrawColor(...MEAL_COLOR[meal]).setLineWidth(0.6)
    doc.line(LEFT, y + 2, width - LEFT, y + 2)
    y += 8
  }

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(90)
  const source = list
    ? [`${label} list: ${list.fileName}`, list.generatedAt && `generated ${list.generatedAt}`].filter(Boolean).join('  ·  ')
    : `No ${label.toLowerCase()} list was loaded for this day.`
  doc.text(source, LEFT, y)

  doc.setFontSize(10).setTextColor(20)
  doc.text(
    `${scanned} of ${guests.length} guests scanned · ${guests.length - scanned} not scanned · ${repeats} repeat scans · ${notOnList.length} not on list`,
    LEFT,
    y + 7,
  )

  const statusCol = 5
  // Pages this table runs onto keep clear of the running header.
  const margin = { left: LEFT, right: LEFT, bottom: 16, top: heading ? RUNNING_HEADER_Y + 6 : 10 }
  autoTable(doc, {
    startY: y + 10,
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
    margin,
    didParseCell: cell => {
      if (cell.section !== 'body' || cell.column.index !== statusCol) return
      const st = status.get(guests[cell.row.index].rezNo)
      cell.cell.styles.textColor = !st?.first ? GREY : st.repeats ? AMBER : GREEN
      if (st?.first) cell.cell.styles.fontStyle = 'bold'
    },
  })

  if (notOnList.length) {
    let deniedY = docY(doc) + 10
    if (deniedY > height - 40) {
      doc.addPage()
      deniedY = 22
    }
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(20)
    doc.text(`Scans not on the ${label.toLowerCase()} list`, LEFT, deniedY)
    autoTable(doc, {
      startY: deniedY + 2,
      head: [['Time', 'Scanned Unit #', 'Result']],
      body: notOnList.map(s => [localTime(s.scannedAt), s.raw.trim(), RESULT_LABEL[s.result]]),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6, textColor: 20 },
      headStyles: { fillColor: [157, 37, 34] },
      margin,
    })
  }
}

/** Where the last table ended. */
const docY = (doc: jsPDF) => (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40
