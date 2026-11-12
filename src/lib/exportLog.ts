import * as XLSX from 'xlsx'
import { localTime } from './dates'
import { db, getSetting, listForDay, mealLabel, RESULT_LABEL, setSetting, type Meal, type Scan } from './db'

function scanRows(scans: Scan[]) {
  return scans.map(s => ({
    Date: s.mealDate,
    Time: localTime(s.scannedAt),
    Meal: mealLabel(s.meal),
    'Rez #': s.rezNo,
    'Unit #': s.unitNo,
    'Client Name': s.clientName,
    'Occ(s)': s.occupants ?? '',
    Result: RESULT_LABEL[s.result],
    'First scanned': s.firstScannedAt ? localTime(s.firstScannedAt) : '',
    'Scanned value': s.raw,
  }))
}

function sheetOf(scans: Scan[]) {
  return XLSX.utils.json_to_sheet(scanRows(scans), {
    header: ['Date', 'Time', 'Meal', 'Rez #', 'Unit #', 'Client Name', 'Occ(s)', 'Result', 'First scanned', 'Scanned value'],
  })
}

/**
 * Downloads the day's attendance as a PDF, one section per meal: every guest on that meal's
 * uploaded list with the time they were let in (or "Not scanned"), then tags that weren't on it.
 */
export async function downloadPdf(day: string, meals: Meal[], fileName: string): Promise<void> {
  // Loaded only when exporting, so the PDF library doesn't slow down the scan screen.
  const { buildLogPdf } = await import('./logPdf')
  buildLogPdf(await pdfInput(day, meals)).save(fileName)
}

/** Downloads a one-page PDF with the guest counts per meal (on list, took the meal, didn't, ...). */
export async function downloadSummaryPdf(day: string, meals: Meal[], fileName: string): Promise<void> {
  const { buildSummaryPdf } = await import('./logPdf')
  buildSummaryPdf(await pdfInput(day, meals)).save(fileName)
}

async function pdfInput(day: string, meals: Meal[]) {
  const sections = await Promise.all(
    meals.map(async meal => {
      const source = await listForDay(day, meal)
      return { meal, list: source?.list ?? null, guests: source?.guests ?? [] }
    }),
  )
  return { day, sections, scans: await scansFor(day) }
}

export async function scansFor(day: string, meal?: Meal): Promise<Scan[]> {
  return meal
    ? db.scans.where('[mealDate+meal]').equals([day, meal]).sortBy('scannedAt')
    : db.scans.where('mealDate').equals(day).sortBy('scannedAt')
}

/**
 * Called when the guard switches meal: saves the meal just finished, unless nothing changed since
 * the last automatic export. With a log folder connected, the day file there is already current.
 */
export async function autoExportMeal(day: string, meal: Meal): Promise<void> {
  const scans = await scansFor(day, meal)
  const doneKey = `autoExported:${day}:${meal}`
  if (scans.length === 0 || (await getSetting<number>(doneKey)) === scans.length) return
  if ((await folderStatus()) === 'granted') await writeDayLog(day)
  else await downloadPdf(day, [meal], `meal-log-${day}-${meal}.pdf`)
  await setSetting(doneKey, scans.length)
}

// ---- Log folder (File System Access API, Chrome/Edge) ----

type PermissionState = 'granted' | 'denied' | 'prompt'
interface DirHandle {
  name: string
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>
  getFileHandle(name: string, opts: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  }>
}
declare global {
  interface Window {
    showDirectoryPicker?: (opts: { id?: string; mode: 'readwrite' }) => Promise<DirHandle>
  }
}

export type FolderStatus = 'unsupported' | 'none' | 'prompt' | 'granted' | 'denied'

export const folderSupported = () => typeof window !== 'undefined' && !!window.showDirectoryPicker

const getFolder = () => getSetting<DirHandle>('logFolder')

export async function folderName(): Promise<string | null> {
  return (await getFolder())?.name ?? null
}

export async function folderStatus(): Promise<FolderStatus> {
  if (!folderSupported()) return 'unsupported'
  const dir = await getFolder()
  return dir ? dir.queryPermission({ mode: 'readwrite' }) : 'none'
}

/** Must run from a click: asks the guard to pick the folder that receives a CSV per day. */
export async function chooseFolder(): Promise<void> {
  const dir = await window.showDirectoryPicker!({ id: 'meal-logs', mode: 'readwrite' })
  await setSetting('logFolder', dir)
  await writeDayLogs()
}

/** Must run from a click: browsers forget folder access after a restart until the guard confirms again. */
export async function reconnectFolder(): Promise<FolderStatus> {
  const dir = await getFolder()
  if (!dir) return 'none'
  const state = await dir.requestPermission({ mode: 'readwrite' })
  if (state === 'granted') await writeDayLogs()
  return state
}

/** Rewrites meal-log-YYYY-MM-DD.csv in the log folder with every scan of that day. */
export async function writeDayLog(day: string): Promise<void> {
  const dir = await getFolder()
  if (!dir || (await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') return
  const file = await dir.getFileHandle(`meal-log-${day}.csv`, { create: true })
  const out = await file.createWritable()
  // BOM so Excel opens names with accents correctly.
  await out.write('﻿' + XLSX.utils.sheet_to_csv(sheetOf(await scansFor(day))))
  await out.close()
}

/** Catches the folder up on days scanned while it was disconnected. */
async function writeDayLogs(): Promise<void> {
  const days = (await db.scans.orderBy('mealDate').uniqueKeys()) as string[]
  for (const day of days.slice(-7)) await writeDayLog(day)
}
