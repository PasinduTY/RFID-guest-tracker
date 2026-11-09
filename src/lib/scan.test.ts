import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, getActiveList, listForDay, saveList, type Meal } from './db'
import { recordScan } from './scan'
import { ScannerBuffer } from './scannerBuffer'

const guest = (rezNo: string, unitNo: string, clientName: string) => ({ rezNo, unitNo, clientName, occupants: 1, qty: 7 })
const listInfo = (meal: Meal, fileName: string, guestCount: number) => ({
  meal,
  fileName,
  importedAt: new Date().toISOString(),
  property: null,
  dateFrom: '2026-11-04',
  dateTo: '2026-11-04',
  generatedAt: null,
  guestCount,
  totalOccupants: guestCount,
})

async function loadList(meal: Meal = 'breakfast') {
  return saveList(listInfo(meal, 'report.xlsx', 2), [
    guest('2026105521', 'NV-214', 'ADOMS, Zachary'),
    guest('2026105519', 'CKD-200', 'BALA, David'),
  ])
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

    expect((await recordScan('NV-214', 'breakfast', listId, new Date(2026, 10, 5, 8, 40))).result).toBe('granted')

    const unknown = await recordScan('NV-999', 'breakfast', listId, at(8, 51))
    expect(unknown.result).toBe('denied')
    expect(unknown.unitNo).toBe('NV-999')
    expect(unknown.rezNo).toBe('')

    // A Rez # is no longer what the tag carries.
    expect((await recordScan('2026105519', 'breakfast', listId, at(8, 52))).result).toBe('denied')
    expect(await db.scans.count()).toBe(5)
  })

  it('keeps separate lists for breakfast and dinner', async () => {
    await loadList('breakfast')
    await saveList(listInfo('dinner', 'dinner.xlsx', 1), [guest('2026100000', 'CK-191', 'NEW, Guest')])
    const breakfast = (await getActiveList('breakfast'))!
    const dinner = (await getActiveList('dinner'))!
    expect(breakfast.fileName).toBe('report.xlsx')
    expect(dinner.fileName).toBe('dinner.xlsx')

    const at = (h: number) => new Date(2026, 10, 4, h, 0)
    expect((await recordScan('NV-214', 'breakfast', breakfast.id, at(8))).result).toBe('granted')
    expect((await recordScan('NV-214', 'dinner', dinner.id, at(19))).result).toBe('denied')
    expect((await recordScan('CK-191', 'dinner', dinner.id, at(19))).result).toBe('granted')

    expect((await listForDay('2026-11-04', 'breakfast'))?.guests.map(g => g.unitNo)).toEqual(['NV-214', 'CKD-200'])
    expect((await listForDay('2026-11-04', 'dinner'))?.guests.map(g => g.unitNo)).toEqual(['CK-191'])
  })

  it('a newly loaded list replaces only that meal\'s list', async () => {
    await loadList('breakfast')
    const dinner = await loadList('dinner')
    const newer = await saveList(listInfo('breakfast', 'b.xlsx', 1), [guest('2026100000', 'CK-191', 'NEW, Guest')])
    expect((await getActiveList('breakfast'))?.id).toBe(newer)
    expect((await getActiveList('dinner'))?.id).toBe(dinner)
    expect((await recordScan('NV-214', 'breakfast', newer)).result).toBe('denied')
    expect((await recordScan('CK-191', 'breakfast', newer)).result).toBe('granted')
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
