import { localDate } from './dates'
import { db, type Meal, type Scan } from './db'
import { unitKey } from './report'

/**
 * Checks a scanned tag (the guest's Unit #) against the active list and logs the result.
 * A guest already let in for the same meal today comes back as "repeat"; the guard decides what to do.
 */
export async function recordScan(raw: string, meal: Meal, listId: number, now = new Date()): Promise<Scan> {
  const unit = unitKey(raw)
  const mealDate = localDate(now)

  return db.transaction('rw', db.guests, db.scans, async () => {
    // When a unit is listed twice, the first row wins (the import screen warns about it).
    const guest = unit ? await db.guests.where('[listId+unitKey]').equals([listId, unit]).first() : undefined
    const first = guest
      ? await db.scans
          .where('[mealDate+meal+rezNo]')
          .equals([mealDate, meal, guest.rezNo])
          .filter(s => s.result === 'granted')
          .first()
      : undefined

    const scan: Omit<Scan, 'id'> = {
      scannedAt: now.toISOString(),
      mealDate,
      meal,
      raw,
      rezNo: guest?.rezNo ?? '',
      result: !guest ? 'denied' : first ? 'repeat' : 'granted',
      listId,
      clientName: guest?.clientName ?? '',
      unitNo: guest?.unitNo ?? raw.trim(),
      occupants: guest?.occupants ?? null,
      ...(first && { firstScannedAt: first.scannedAt }),
    }
    const id = await db.scans.add(scan as Scan)
    return { ...scan, id }
  })
}
