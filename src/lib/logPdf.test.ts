import { describe, expect, it } from 'vitest'
import type { Scan } from './db'
import { buildLogPdf } from './logPdf'

const scan = (i: number, result: Scan['result']): Scan => ({
  id: i,
  scannedAt: new Date(2026, 10, 9, 12, i % 60).toISOString(),
  mealDate: '2026-11-09',
  meal: i % 2 ? 'lunch' : 'dinner',
  raw: String(2026105000 + i),
  rezNo: String(2026105000 + i),
  result,
  listId: 1,
  clientName: result === 'denied' ? '' : `GUEST, Number ${i}`,
  unitNo: result === 'denied' ? '' : `NV-${200 + i}`,
  occupants: result === 'denied' ? null : 1,
})

describe('buildLogPdf', () => {
  it('lays out a multi-page A4 log with every scan', () => {
    const scans = Array.from({ length: 120 }, (_, i) => scan(i, i % 10 === 0 ? 'denied' : i % 7 === 0 ? 'repeat' : 'granted'))
    const doc = buildLogPdf(scans, { day: '2026-11-09', property: 'Black Rock Tourist Park' })

    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    const text = doc.output()
    expect(text.startsWith('%PDF')).toBe(true)
    expect(text).toContain('Meal access log')
    expect(text).toContain('GUEST, Number 119')
  })

  it('still produces a page when there are no scans', () => {
    const doc = buildLogPdf([], { day: '2026-11-09', meal: 'lunch' })
    expect(doc.getNumberOfPages()).toBe(1)
    expect(doc.output()).toContain('No scans.')
  })
})
