import { describe, expect, it } from 'vitest'
import type { Guest, GuestList, Scan } from './db'
import { buildLogPdf, buildSummaryPdf, mealStats } from './logPdf'

const list: GuestList = {
  id: 1,
  fileName: 'document (17).xlsx',
  importedAt: '',
  property: 'Black Rock Tourist Park',
  dateFrom: '2026-11-09',
  dateTo: '2026-11-09',
  generatedAt: '09-Nov-26 04:12 PM',
  guestCount: 3,
  totalOccupants: 3,
}

const guest = (id: number, rezNo: string, clientName: string): Guest => ({
  id, listId: 1, rezNo, clientName, unitNo: `NV-${200 + id}`, occupants: 1, qty: 7,
})
const guests = [guest(1, '2026105521', 'ADOMS, Zachary'), guest(2, '2026105519', 'BALA, David'), guest(3, '2026105532', 'BIRD, Brian')]

const scan = (id: number, rezNo: string, meal: Scan['meal'], result: Scan['result'], minute: number): Scan => ({
  id, rezNo, meal, result, raw: rezNo, listId: 1, mealDate: '2026-11-09',
  scannedAt: new Date(2026, 10, 9, meal === 'breakfast' ? 8 : 19, minute).toISOString(),
  clientName: '', unitNo: '', occupants: null,
})

/** Text drawn on the pages (jsPDF writes it uncompressed). */
const pdfText = (doc: ReturnType<typeof buildLogPdf>) => doc.output()

const dinnerGuests = [guest(4, '2026105600', 'DINNER, Only'), guest(1, '2026105521', 'ADOMS, Zachary')]

describe('buildLogPdf', () => {
  it('gives each meal its own section built from that meal\'s list', () => {
    const scans = [
      scan(1, '2026105521', 'breakfast', 'granted', 10),
      scan(2, '2026105521', 'breakfast', 'repeat', 30),
      scan(3, '2026199999', 'breakfast', 'denied', 31),
      scan(4, '2026105600', 'dinner', 'granted', 5),
    ]
    const doc = buildLogPdf({
      day: '2026-11-09',
      sections: [
        { meal: 'breakfast', list, guests },
        { meal: 'dinner', list: { ...list, fileName: 'dinner.xlsx' }, guests: dinnerGuests },
      ],
      scans,
    })
    const text = pdfText(doc)

    expect(doc.getNumberOfPages()).toBe(2)
    for (const g of [...guests, ...dinnerGuests]) expect(text).toContain(g.clientName)
    // The top of page 1 makes clear both meals are inside, and where each starts.
    expect(text).toContain('Breakfast and Dinner Attendance Report')
    expect(text).toContain('This report covers 2 meals: Breakfast \\(page 1\\)  ·  Dinner \\(page 2\\)')
    expect(text).toContain('Dinner section')
    expect(text).toContain('Dinner list: dinner.xlsx')
    expect(text).toContain('+1 repeat') // PDF escapes the brackets around it
    expect(text).toContain('Not scanned')
    expect(text).toContain('1 of 3 guests scanned · 2 not scanned · 1 repeat scans · 1 not on list')
    expect(text).toContain('1 of 2 guests scanned · 1 not scanned · 0 repeat scans · 0 not on list')
    expect(text).toContain('Scans not on the breakfast list')
    expect(text).toContain('2026199999')
  })

  it('shows only the chosen meal', () => {
    const text = pdfText(buildLogPdf({ day: '2026-11-09', sections: [{ meal: 'dinner', list, guests: dinnerGuests }], scans: [] }))
    expect(text).toContain('0 of 2 guests scanned')
    expect(text).toContain('Dinner Attendance Report')
    expect(text).not.toContain('Breakfast')
    expect(text).not.toContain('This report covers')
    expect(text).not.toContain('Scans not on the')
  })

  it('says so when a meal had no list', () => {
    const text = pdfText(buildLogPdf({ day: '2026-11-09', sections: [{ meal: 'dinner', list: null, guests: [] }], scans: [] }))
    expect(text).toContain('No dinner list was loaded for this day.')
  })

  it('runs onto more pages for a long list', () => {
    const many = Array.from({ length: 120 }, (_, i) => guest(i + 1, String(2026105000 + i), `GUEST, Number ${i}`))
    const doc = buildLogPdf({ day: '2026-11-09', sections: [{ meal: 'breakfast', list, guests: many }], scans: [] })
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    expect(pdfText(doc)).toContain('GUEST, Number 119')
  })
})

describe('summary', () => {
  const scans = [
    scan(1, '2026105521', 'breakfast', 'granted', 10),
    scan(2, '2026105521', 'breakfast', 'repeat', 30),
    scan(3, '2026199999', 'breakfast', 'denied', 31),
    scan(4, '2026105519', 'breakfast', 'granted', 40),
    scan(5, '2026105600', 'dinner', 'granted', 5),
  ]

  it('counts guests who took and missed each meal', () => {
    const breakfast = mealStats({ meal: 'breakfast', list, guests }, scans)
    expect(breakfast).toMatchObject({ guests: 3, tookMeal: 2, repeats: 1, occupants: 3, occupantsTookMeal: 2 })
    expect(breakfast.notOnList).toHaveLength(1)
    expect(breakfast.firstScan).toBe(scans[0].scannedAt)
    expect(breakfast.lastScan).toBe(scans[3].scannedAt)

    const dinner = mealStats({ meal: 'dinner', list, guests: dinnerGuests }, scans)
    expect(dinner).toMatchObject({ guests: 2, tookMeal: 1, repeats: 0 })
  })

  it('fits on one page with a column per meal', () => {
    const doc = buildSummaryPdf({
      day: '2026-11-09',
      sections: [
        { meal: 'breakfast', list, guests },
        { meal: 'dinner', list: null, guests: [] },
      ],
      scans,
    })
    const text = pdfText(doc)
    expect(doc.getNumberOfPages()).toBe(1)
    expect(text).toContain('Meal Summary')
    expect(text).toContain('No. of guests who took the meal')
    expect(text).toContain("No. of guests who didn't take the meal")
    expect(text).toContain('67%')
    expect(text).toContain('No list loaded')
  })
})
