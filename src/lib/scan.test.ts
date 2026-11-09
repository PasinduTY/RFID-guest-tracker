import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, saveList } from './db'
import { recordScan } from './scan'
import { ScannerBuffer } from './scannerBuffer'

const guest = (rezNo: string, unitNo: string, clientName: string) => ({ rezNo, unitNo, clientName, occupants: 1, qty: 7 })

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
    [guest('2026105521', 'NV-214', 'ADOMS, Zachary'), guest('2026105519', 'CKD-200', 'BALA, David')],
  )
}

describe('recordScan', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('grants a listed Unit #, flags the repeat, and denies unknown tags', async () => {
    const listId = await loadList()
    const at = (h: number, m: number) => new Date(2026, 10, 4, h, m)

    const first = await recordScan('NV-214', 'breakfast', listId, at(8, 42))
    expect(first.result).toBe('granted')
    expect(first.clientName).toBe('ADOMS, Zachary')
    expect(first.rezNo).toBe('2026105521')

    // Case and stray whitespace from the scanner don't matter.
    const again = await recordScan(' nv-214\n', 'breakfast', listId, at(8, 50))
    expect(again.result).toBe('repeat')
    expect(again.firstScannedAt).toBe(first.scannedAt)

    expect((await recordScan('NV-214', 'dinner', listId, at(19, 5))).result).toBe('granted')
    expect((await recordScan('NV-214', 'breakfast', listId, new Date(2026, 10, 5, 8, 40))).result).toBe('granted')

    const unknown = await recordScan('NV-999', 'breakfast', listId, at(8, 51))
    expect(unknown.result).toBe('denied')
    expect(unknown.unitNo).toBe('NV-999')
    expect(unknown.rezNo).toBe('')

    // A Rez # is no longer what the tag carries.
    expect((await recordScan('2026105519', 'breakfast', listId, at(8, 52))).result).toBe('denied')
    expect(await db.scans.count()).toBe(6)
  })

  it('uses only the newest list', async () => {
    await loadList()
    const newer = await saveList(
      { fileName: 'b.xlsx', importedAt: '', property: null, dateFrom: null, dateTo: null, generatedAt: null, guestCount: 1, totalOccupants: 1 },
      [guest('2026100000', 'CK-191', 'NEW, Guest')],
    )
    expect((await recordScan('NV-214', 'breakfast', newer)).result).toBe('denied')
    expect((await recordScan('CK-191', 'breakfast', newer)).result).toBe('granted')
    expect(await db.guests.where('listId').equals(newer).count()).toBe(1)
  })
})

describe('ScannerBuffer', () => {
  const type = (buf: ScannerBuffer, keys: string[], start: number, gap: number) =>
    [...keys, 'Enter'].map((k, i) => buf.push(k, start + i * gap)).at(-1)

  it('returns fast keystrokes ended by Enter as a scan, ignoring Shift', () => {
    // A keyboard-emulating scanner presses Shift before each capital letter.
    const keys = ['Shift', 'N', 'Shift', 'V', '-', '2', '1', '4']
    expect(type(new ScannerBuffer(100), keys, 0, 8)).toBe('NV-214')
  })

  it('ignores slow, human typing', () => {
    expect(type(new ScannerBuffer(100), [...'NV-214'], 0, 250)).toBeNull()
  })

  it('drops stray keys typed before a scan', () => {
    const buf = new ScannerBuffer(100)
    buf.push('x', 0)
    expect(type(buf, [...'CKD-200'], 1000, 8)).toBe('CKD-200')
  })
})
