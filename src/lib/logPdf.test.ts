import { describe, expect, it } from 'vitest'
import type { Guest, GuestList, Scan } from './db'
import { buildLogPdf } from './logPdf'

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
  scannedAt: new Date(2026, 10, 9, meal === 'lunch' ? 12 : 19, minute).toISOString(),
  clientName: '', unitNo: '', occupants: null,
})

/** Text drawn on the pages (jsPDF writes it uncompressed). */
const pdfText = (doc: ReturnType<typeof buildLogPdf>) => doc.output()

describe('buildLogPdf', () => {
  it('lists every uploaded guest with their scan time or "Not scanned"', () => {
    const scans = [
      scan(1, '2026105521', 'lunch', 'granted', 10),
      scan(2, '2026105521', 'lunch', 'repeat', 30),
      scan(3, '2026199999', 'lunch', 'denied', 31),
      scan(4, '2026105519', 'dinner', 'granted', 5),
    ]
    const text = pdfText(buildLogPdf({ day: '2026-11-09', meals: ['lunch', 'dinner'], list, guests, scans }))

    for (const g of guests) expect(text).toContain(g.clientName)
    expect(text).toContain('+1 repeat') // PDF escapes the brackets around it
    expect(text).toContain('Not scanned')
    expect(text).toContain('Lunch: 1 of 3 guests scanned')
    expect(text).toContain('Dinner: 1 of 3 guests scanned')
    expect(text).toContain('Scans not on the guest list')
    expect(text).toContain('2026199999')
  })

  it('shows only the chosen meal column', () => {
    const text = pdfText(buildLogPdf({ day: '2026-11-09', meals: ['dinner'], list, guests, scans: [] }))
    expect(text).toContain('Dinner: 0 of 3 guests scanned')
    expect(text).not.toContain('Lunch:')
    expect(text).not.toContain('Scans not on the guest list')
  })

  it('runs onto more pages for a long list', () => {
    const many = Array.from({ length: 120 }, (_, i) => guest(i + 1, String(2026105000 + i), `GUEST, Number ${i}`))
    const doc = buildLogPdf({ day: '2026-11-09', meals: ['lunch', 'dinner'], list, guests: many, scans: [] })
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    expect(pdfText(doc)).toContain('GUEST, Number 119')
  })
})
