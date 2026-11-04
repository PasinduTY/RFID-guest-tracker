import { localDate } from './dates'
import { db, type Meal, type Scan } from './db'

/**
 * Checks a scanned Rez # against the active list and logs the result.
 * A guest already let in for the same meal today comes back as "repeat"; the guard decides what to do.
 */
export async function recordScan(raw: string, meal: Meal, listId: number, now = new Date()): Promise<Scan> {
  const rezNo = raw.trim()
  const mealDate = localDate(now)

  return db.transaction('rw', db.guests, db.scans, async () => {
    const guest = await db.guests.where('[listId+rezNo]').equals([listId, rezNo]).first()
    const first = guest
      ? await db.scans
          .where('[mealDate+meal+rezNo]')
          .equals([mealDate, meal, rezNo])
          .filter(s => s.result === 'granted')
          .first()
      : undefined

    const scan: Omit<Scan, 'id'> = {
      scannedAt: now.toISOString(),
      mealDate,
      meal,
      raw,
      rezNo,
      result: !guest ? 'denied' : first ? 'repeat' : 'granted',
      listId,
      clientName: guest?.clientName ?? '',
      unitNo: guest?.unitNo ?? '',
      occupants: guest?.occupants ?? null,
      ...(first && { firstScannedAt: first.scannedAt }),
    }
    const id = await db.scans.add(scan as Scan)
    return { ...scan, id }
  })
}
