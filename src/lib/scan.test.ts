import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, saveList } from './db'
import { recordScan } from './scan'
import { ScannerBuffer } from './scannerBuffer'

const guest = (rezNo: string, clientName: string) => ({ rezNo, clientName, unitNo: 'NV-214', occupants: 1, qty: 7 })

async function loadList() {
  return saveList(
    {
      fileName: 'report.xlsx',
      importedAt: new Date().toISOString(),
      property: null,
      dateFrom: '2026-11-04',
      dateTo: '2026-11-04',
      generatedAt: null,
      guestCount: 2,
      totalOccupants: 2,
    },
    [guest('2026105521', 'ADOMS, Zachary'), guest('2026105519', 'BALA, David')],
  )
}

describe('recordScan', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('grants a listed guest, flags the repeat, and denies unknown tags', async () => {
    const listId = await loadList()
    const at = (h: number, m: number) => new Date(2026, 10, 4, h, m)

    const first = await recordScan('2026105521', 'lunch', listId, at(12, 42))
    expect(first.result).toBe('granted')
    expect(first.clientName).toBe('ADOMS, Zachary')

    const again = await recordScan('2026105521\n', 'lunch', listId, at(12, 50))
    expect(again.result).toBe('repeat')
    expect(again.firstScannedAt).toBe(first.scannedAt)

    expect((await recordScan('2026105521', 'dinner', listId, at(19, 5))).result).toBe('granted')
    expect((await recordScan('2026105521', 'lunch', listId, new Date(2026, 10, 5, 12, 40))).result).toBe('granted')

    const unknown = await recordScan('2026199999', 'lunch', listId, at(12, 51))
    expect(unknown.result).toBe('denied')
    expect(await db.scans.count()).toBe(5)
  })

  it('uses only the newest list', async () => {
    await loadList()
    const newer = await saveList(
      { fileName: 'b.xlsx', importedAt: '', property: null, dateFrom: null, dateTo: null, generatedAt: null, guestCount: 1, totalOccupants: 1 },
      [guest('2026100000', 'NEW, Guest')],
    )
    expect((await recordScan('2026105521', 'lunch', newer)).result).toBe('denied')
    expect((await recordScan('2026100000', 'lunch', newer)).result).toBe('granted')
    expect(await db.guests.where('listId').equals(newer).count()).toBe(1)
  })
})

describe('ScannerBuffer', () => {
  const type = (buf: ScannerBuffer, text: string, start: number, gap: number) =>
    [...text, 'Enter'].map((k, i) => buf.push(k, start + i * gap)).at(-1)

  it('returns fast keystrokes ended by Enter as a scan', () => {
    expect(type(new ScannerBuffer(100), '2026105521', 0, 8)).toBe('2026105521')
  })

  it('ignores slow, human typing', () => {
    expect(type(new ScannerBuffer(100), '2026105521', 0, 250)).toBeNull()
  })

  it('drops stray keys typed before a scan', () => {
    const buf = new ScannerBuffer(100)
    buf.push('x', 0)
    expect(type(buf, '2026105521', 1000, 8)).toBe('2026105521')
  })
})
