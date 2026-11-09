import Dexie, { type EntityTable } from 'dexie'
import type { ReportGuest } from './report'

export type Meal = 'lunch' | 'dinner'
export type ScanResult = 'granted' | 'denied' | 'repeat'

export const MEALS: Meal[] = ['lunch', 'dinner']
export const MEAL_LABEL: Record<Meal, string> = { lunch: 'Lunch', dinner: 'Dinner' }

/** Label for a stored meal; scans saved before the meals changed may hold other values (e.g. "breakfast"). */
export const mealLabel = (meal: string) => MEAL_LABEL[meal as Meal] ?? meal.charAt(0).toUpperCase() + meal.slice(1)

export const isMeal = (value: unknown): value is Meal => MEALS.includes(value as Meal)
export const RESULT_LABEL: Record<ScanResult, string> = { granted: 'Granted', denied: 'Denied', repeat: 'Repeat' }

/** One imported report file. */
export interface GuestList {
  id: number
  fileName: string
  importedAt: string
  property: string | null
  dateFrom: string | null
  dateTo: string | null
  generatedAt: string | null
  guestCount: number
  totalOccupants: number | null
}

export interface Guest extends ReportGuest {
  id: number
  listId: number
}

export interface Scan {
  id: number
  scannedAt: string
  /** Local YYYY-MM-DD of the scan; with `meal` this identifies one sitting. */
  mealDate: string
  meal: Meal
  /** Exactly what the scanner typed. */
  raw: string
  rezNo: string
  result: ScanResult
  listId: number
  // Copied from the guest row so the log still reads correctly after a new list is loaded.
  clientName: string
  unitNo: string
  occupants: number | null
  /** For repeats: when this guest was first let in for this meal. */
  firstScannedAt?: string
}

interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('meal-access') as Dexie & {
  lists: EntityTable<GuestList, 'id'>
  guests: EntityTable<Guest, 'id'>
  scans: EntityTable<Scan, 'id'>
  settings: EntityTable<Setting, 'key'>
}

db.version(1).stores({
  lists: '++id',
  guests: '++id, listId, [listId+rezNo]',
  scans: '++id, mealDate, [mealDate+meal], [mealDate+meal+rezNo]',
  settings: 'key',
})

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

export async function getActiveList(): Promise<GuestList | undefined> {
  const id = await getSetting<number>('activeListId')
  return id === undefined ? undefined : db.lists.get(id)
}

/** Saves a checked report as the active list. Older lists are kept so past days can still be reported on. */
export async function saveList(list: Omit<GuestList, 'id'>, guests: ReportGuest[]): Promise<number> {
  return db.transaction('rw', db.lists, db.guests, db.settings, async () => {
    const listId = await db.lists.add(list as GuestList)
    await db.guests.bulkAdd(guests.map(g => ({ ...g, listId }) as Guest))
    await setSetting('activeListId', listId)
    return listId
  })
}

/**
 * The guest list a day's scans were checked against: the newest list used that day
 * (a corrected report may have been loaded mid-day), or the active list when nobody was scanned yet.
 */
export async function listForDay(day: string): Promise<{ list: GuestList; guests: Guest[] } | null> {
  const usedIds = (await db.scans.where('mealDate').equals(day).toArray()).map(s => s.listId)
  const list = usedIds.length ? await db.lists.get(Math.max(...usedIds)) : await getActiveList()
  if (!list) return null
  return { list, guests: await db.guests.where('listId').equals(list.id).sortBy('id') }
}
