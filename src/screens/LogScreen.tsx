import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, FileDown, FileText, FolderCheck, FolderOpen, FolderX, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { MealIllustration } from '../components/MealIllustration'
import { ResultPill } from '../components/ResultPill'
import { formatDay, localDate, localTime } from '../lib/dates'
import { db, listForDay, MEAL_LABEL, mealLabel, MEALS, RESULT_LABEL, type Meal, type Scan, type ScanResult } from '../lib/db'
import {
  chooseFolder,
  downloadPdf,
  downloadSummaryPdf,
  folderName,
  folderStatus,
  reconnectFolder,
} from '../lib/exportLog'

const RESULTS: ScanResult[] = ['granted', 'repeat', 'denied']
const MEAL_ICON: Record<Meal, LucideIcon> = { breakfast: Sun, dinner: Moon }

export function LogScreen() {
  const today = localDate()
  const days = useLiveQuery(async () => {
    const keys = (await db.scans.orderBy('mealDate').uniqueKeys()) as string[]
    return keys.includes(today) ? keys.reverse() : [today, ...keys.reverse()]
  }, [today])
  const [day, setDay] = useState(today)
  const [meal, setMeal] = useState<Meal | 'all'>('all')
  const [result, setResult] = useState<ScanResult | 'all'>('all')

  const dayScans = useLiveQuery(() => db.scans.where('mealDate').equals(day).sortBy('scannedAt'), [day])
  // Guest count of the list each meal was checked against that day, for the "took the meal" figures.
  const guestCounts = useLiveQuery(
    async () => Object.fromEntries(await Promise.all(MEALS.map(async m => [m, (await listForDay(day, m))?.list.guestCount ?? null]))),
    [day],
  ) as Record<Meal, number | null> | undefined

  const mealScans = (dayScans ?? []).filter(s => meal === 'all' || s.meal === meal)
  const shown = mealScans.filter(s => result === 'all' || s.result === result).reverse()
  const resultCount = (r: ScanResult) => mealScans.filter(s => s.result === r).length

  // The PDFs cover every guest on the day's uploaded lists, so only the date and meal filters apply to them.
  const pdfMeals = meal === 'all' ? MEALS : [meal]
  const pdfName = (kind: string) => `meal-${kind}-${day}${meal === 'all' ? '' : `-${meal}`}.pdf`

  return (
    <section className="screen">
      <header className="page-head with-actions">
        <div>
          <h2>Scan log</h2>
          <p className="muted">Every scan, by day and meal. Download a summary or the full guest report.</p>
        </div>
        <div className="head-actions">
          <button onClick={() => downloadSummaryPdf(day, pdfMeals, pdfName('summary'))}>
            <FileText size={16} aria-hidden="true" />
            Summary PDF
          </button>
          <button className="primary" onClick={() => downloadPdf(day, pdfMeals, pdfName('log'))}>
            <FileDown size={16} aria-hidden="true" />
            Full report PDF
          </button>
        </div>
      </header>

      <div className="filters">
        <label className="select-with-icon">
          <CalendarDays size={16} aria-hidden="true" />
          <select value={day} onChange={e => setDay(e.target.value)} aria-label="Date">
            {(days ?? [today]).map(d => (
              <option key={d} value={d}>{d === today ? `Today · ${formatDay(d)}` : formatDay(d)}</option>
            ))}
          </select>
        </label>
        <div className="segmented" role="radiogroup" aria-label="Meal">
          <button role="radio" aria-checked={meal === 'all'} className={meal === 'all' ? 'on' : ''} onClick={() => setMeal('all')}>
            Both meals
          </button>
          {MEALS.map(m => {
            const Icon = MEAL_ICON[m]
            return (
              <button key={m} role="radio" aria-checked={meal === m} className={meal === m ? `on ${m}` : m} onClick={() => setMeal(m)}>
                <Icon size={16} aria-hidden="true" />
                {MEAL_LABEL[m]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="meal-stats">
        {pdfMeals.map(m => (
          <MealStat key={m} meal={m} scans={(dayScans ?? []).filter(s => s.meal === m)} guests={guestCounts?.[m] ?? null} />
        ))}
      </div>

      <div className="log-list">
        <div className="log-list-head">
          <span className="section-label">Scans</span>
          <div className="chips" role="radiogroup" aria-label="Result">
            <button role="radio" aria-checked={result === 'all'} className={result === 'all' ? 'chip on' : 'chip'} onClick={() => setResult('all')}>
              All <span className="chip-count">{mealScans.length}</span>
            </button>
            {RESULTS.map(r => (
              <button key={r} role="radio" aria-checked={result === r} className={result === r ? 'chip on' : 'chip'} onClick={() => setResult(r)}>
                <span className={`dot ${r}`} aria-hidden="true" />
                {RESULT_LABEL[r]} <span className="chip-count">{resultCount(r)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap tall">
          <table>
            <thead>
              <tr><th>Time</th><th>Meal</th><th>Unit #</th><th>Name</th><th>Rez #</th><th>Result</th></tr>
            </thead>
            <tbody>
              {shown.map(s => (
                <tr key={s.id}>
                  <td className="muted">{localTime(s.scannedAt)}</td>
                  <td>{mealLabel(s.meal)}</td>
                  <td className="mono">{s.unitNo || '–'}</td>
                  <td>{s.clientName || <span className="muted">Not on list</span>}</td>
                  <td className="mono muted">{s.rezNo || '–'}</td>
                  <td>
                    <ResultPill result={s.result} />
                    {s.firstScannedAt && <span className="faint small-note"> first {localTime(s.firstScannedAt)}</span>}
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr className="empty-table-row"><td colSpan={6}>No scans match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LogFolder />
    </section>
  )
}

/** One meal's numbers for the day: guests who took the meal against the uploaded list, plus scan results. */
function MealStat({ meal, scans, guests }: { meal: Meal; scans: Scan[]; guests: number | null }) {
  const took = new Set(scans.filter(s => s.result === 'granted').map(s => s.rezNo)).size
  const count = (r: ScanResult) => scans.filter(s => s.result === r).length
  const percent = guests ? Math.min(100, Math.round((took / guests) * 100)) : 0

  return (
    <div className={`meal-stat ${meal}`}>
      <div className="meal-stat-head">
        <MealIllustration meal={meal} size={40} />
        <span className="meal-stat-title">{MEAL_LABEL[meal]}</span>
        <span className="meal-stat-percent">{guests ? `${percent}%` : ''}</span>
      </div>
      <div className="meal-stat-main">
        <span className="meal-stat-value">{took}</span>
        <span className="muted">{guests === null ? 'took the meal · no list loaded' : `of ${guests} took the meal`}</span>
      </div>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${percent}%` }} />
      </div>
      <div className="meal-stat-foot">
        {guests !== null && <span>{guests - took} didn't</span>}
        <span><span className="dot repeat" aria-hidden="true" /> {count('repeat')} repeat</span>
        <span><span className="dot denied" aria-hidden="true" /> {count('denied')} denied</span>
      </div>
    </div>
  )
}

/** Optional folder where a CSV of each day's scans is kept up to date after every scan. */
function LogFolder() {
  // Folder permission lives in the browser, not the database, so `checks` re-reads it after each action.
  const [checks, setChecks] = useState(0)
  const folder = useLiveQuery(async () => ({ status: await folderStatus(), name: await folderName() }), [checks])
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError("Couldn't use that folder. Try another one.")
    }
    setChecks(n => n + 1)
  }

  if (!folder) return null
  const { status, name } = folder
  const Icon = status === 'granted' ? FolderCheck : status === 'prompt' || status === 'denied' ? FolderX : FolderOpen

  return (
    <div className={`folder ${status}`}>
      <span className="folder-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="folder-text">
        <strong>Backup folder</strong>
        {status === 'unsupported' && (
          <span className="muted">This browser can't save to a folder. Use Chrome or Edge, or download a PDF after each meal.</span>
        )}
        {status === 'none' && <span className="muted">Not set. Each meal's log is downloaded when you switch meal.</span>}
        {status === 'granted' && (
          <span className="muted">
            Saving each day's log to <strong>{name}</strong> after every scan.
          </span>
        )}
        {(status === 'prompt' || status === 'denied') && (
          <span className="warning-text">
            Not saving to <strong>{name}</strong> until access is confirmed.
          </span>
        )}
        {error && <span className="danger-text">{error}</span>}
      </div>
      {status === 'none' && <button onClick={() => run(chooseFolder)}>Choose folder</button>}
      {status === 'granted' && <button onClick={() => run(chooseFolder)}>Change</button>}
      {(status === 'prompt' || status === 'denied') && (
        <button className="primary" onClick={() => run(reconnectFolder)}>Reconnect</button>
      )}
    </div>
  )
}
