import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ResultPill } from '../components/ResultPill'
import { formatDay, localDate, localTime } from '../lib/dates'
import { db, MEAL_LABEL, mealLabel, MEALS, RESULT_LABEL, type Meal, type ScanResult } from '../lib/db'
import {
  chooseFolder,
  downloadPdf,
  folderName,
  folderStatus,
  reconnectFolder,
} from '../lib/exportLog'

const RESULTS: ScanResult[] = ['granted', 'repeat', 'denied']

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
  const shown = (dayScans ?? [])
    .filter(s => (meal === 'all' || s.meal === meal) && (result === 'all' || s.result === result))
    .reverse()

  // The PDF lists every guest on the day's uploaded list, so only the date and meal filters apply to it.
  function exportReport() {
    downloadPdf(day, meal === 'all' ? MEALS : [meal], `meal-log-${day}${meal === 'all' ? '' : `-${meal}`}.pdf`)
  }

  return (
    <section className="screen">
      <div className="filters">
        <select value={day} onChange={e => setDay(e.target.value)} aria-label="Date">
          {(days ?? [today]).map(d => (
            <option key={d} value={d}>{formatDay(d)}</option>
          ))}
        </select>
        <select value={meal} onChange={e => setMeal(e.target.value as Meal | 'all')} aria-label="Meal">
          <option value="all">Lunch and dinner</option>
          {MEALS.map(m => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
        </select>
        <select value={result} onChange={e => setResult(e.target.value as ScanResult | 'all')} aria-label="Result">
          <option value="all">All results</option>
          {RESULTS.map(r => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}
        </select>
        <button className="push-right" onClick={exportReport}>
          Export to PDF
        </button>
      </div>

      <p className="summary">
        {MEALS.map(m => {
          const scans = (dayScans ?? []).filter(s => s.meal === m)
          const count = (r: ScanResult) => scans.filter(s => s.result === r).length
          return (
            <span key={m}>
              <strong>{MEAL_LABEL[m]}:</strong>{' '}
              {scans.length === 0
                ? 'no scans'
                : `${count('granted')} granted · ${count('repeat')} repeat · ${count('denied')} denied`}
            </span>
          )
        })}
      </p>

      <div className="table-wrap tall">
        <table>
          <thead>
            <tr><th>Time</th><th>Meal</th><th>Unit #</th><th>Name</th><th>Rez #</th><th>Result</th></tr>
          </thead>
          <tbody>
            {shown.map(s => (
              <tr key={s.id}>
                <td>{localTime(s.scannedAt)}</td>
                <td>{mealLabel(s.meal)}</td>
                <td className="mono">{s.unitNo || '–'}</td>
                <td>{s.clientName || <span className="muted">Not on list</span>}</td>
                <td className="mono">{s.rezNo || '–'}</td>
                <td>
                  <ResultPill result={s.result} />
                  {s.firstScannedAt && <span className="muted"> first {localTime(s.firstScannedAt)}</span>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="muted">No scans match.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <LogFolder />
    </section>
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
  return (
    <div className="folder">
      <strong>Log folder</strong>
      {status === 'unsupported' && (
        <span className="muted">This browser can't save to a folder. Use Chrome or Edge, or export to PDF after each meal.</span>
      )}
      {status === 'none' && (
        <>
          <span className="muted">Not set. Logs are downloaded when you switch meal.</span>
          <button onClick={() => run(chooseFolder)}>Choose folder</button>
        </>
      )}
      {status === 'granted' && (
        <>
          <span>Saving each day's log to <strong>{name}</strong> after every scan.</span>
          <button onClick={() => run(chooseFolder)}>Change</button>
        </>
      )}
      {(status === 'prompt' || status === 'denied') && (
        <>
          <span className="warning-text">Not saving to <strong>{name}</strong> until access is confirmed.</span>
          <button onClick={() => run(reconnectFolder)}>Reconnect folder</button>
        </>
      )}
      {error && <span className="danger-text">{error}</span>}
    </div>
  )
}
