import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { ResultPill } from '../components/ResultPill'
import { formatDay, localDate, localTime } from '../lib/dates'
import { db, MEAL_LABEL, MEALS, type GuestList, type Meal, type Scan } from '../lib/db'
import { writeDayLog } from '../lib/exportLog'
import { beep } from '../lib/feedback'
import { recordScan } from '../lib/scan'
import { useScanner } from '../lib/useScanner'

/** After this hour the guard is reminded if Breakfast is still selected. */
const DINNER_REMINDER_HOUR = 15
/** How long a result stays on screen before it goes back to "Ready to scan". */
const RESULT_SHOWN_MS = 10_000

interface Props {
  list: GuestList | null
  meal: Meal
  onMealChange: (meal: Meal) => void
  onImport: () => void
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

export function ScanScreen({ list, meal, onMealChange, onImport }: Props) {
  const [last, setLast] = useState<Scan | null>(null)
  const [manual, setManual] = useState('')
  const now = useNow(30_000)
  const today = localDate(now)

  const checkedIn = useLiveQuery(
    () => db.scans.where('[mealDate+meal]').equals([today, meal]).filter(s => s.result === 'granted').count(),
    [today, meal],
  )
  const recent = useLiveQuery(
    () => db.scans.where('[mealDate+meal]').equals([today, meal]).reverse().limit(10).toArray(),
    [today, meal],
  )

  async function check(code: string) {
    if (!list) return
    const scan = await recordScan(code, meal, list.id)
    setLast(scan)
    beep(scan.result)
    writeDayLog(scan.mealDate).catch(() => {}) // the Log screen shows folder problems
  }

  useScanner(check, !!list)

  // Clear the result after a while; a result from the other meal is never shown.
  useEffect(() => {
    if (!last) return
    const t = setTimeout(() => setLast(null), RESULT_SHOWN_MS)
    return () => clearTimeout(t)
  }, [last])
  const shown = last?.meal === meal ? last : null

  if (!list) {
    return (
      <section className="screen empty">
        <h2>Load today's guest list</h2>
        <p className="muted">Scanning starts once the Rex meal report is imported.</p>
        <button className="primary" onClick={onImport}>Import report</button>
      </section>
    )
  }

  const listCoversToday = list.dateFrom && list.dateFrom <= today && today <= (list.dateTo ?? list.dateFrom)
  const remind = meal === 'breakfast' && now.getHours() >= DINNER_REMINDER_HOUR

  return (
    <section className="screen">
      <div className="scan-head">
        <div className="meal-switch" role="radiogroup" aria-label="Meal">
          {MEALS.map(m => (
            <button
              key={m}
              role="radio"
              aria-checked={meal === m}
              className={meal === m ? `meal on ${m}` : 'meal'}
              onClick={() => onMealChange(m)}
            >
              {MEAL_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="counter">
          <span className="counter-value">
            {checkedIn ?? 0} / {list.guestCount}
          </span>
          <span className={listCoversToday ? 'muted' : 'warning-text'}>
            checked in · list {list.dateFrom ? formatDay(list.dateFrom) : 'undated'}
          </span>
        </div>
      </div>

      {remind && (
        <p className="notice warning reminder">
          It's after {DINNER_REMINDER_HOUR}:00 and Breakfast is still selected.
          <button onClick={() => onMealChange('dinner')}>Switch to dinner</button>
        </p>
      )}
      {!listCoversToday && (
        <p className="notice warning">
          The active list isn't for today ({formatDay(today)}).{' '}
          <button className="link-button" onClick={onImport}>Load today's report</button>
        </p>
      )}

      <ResultPanel scan={shown} meal={meal} />

      <details className="manual">
        <summary>Type a Unit # instead</summary>
        <form
          onSubmit={e => {
            e.preventDefault()
            if (manual.trim()) check(manual)
            setManual('')
          }}
        >
          <input value={manual} onChange={e => setManual(e.target.value)} placeholder="Enter Unit #" aria-label="Unit #" />
          <button type="submit">Check</button>
        </form>
      </details>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Time</th><th>Name</th><th>Unit</th><th>Result</th></tr>
          </thead>
          <tbody>
            {recent?.map(s => (
              <tr key={s.id}>
                <td>{localTime(s.scannedAt)}</td>
                <td className={s.clientName ? '' : 'muted'}>{s.clientName || 'Not on list'}</td>
                <td className="mono">{s.unitNo || '–'}</td>
                <td><ResultPill result={s.result} /></td>
              </tr>
            ))}
            {recent?.length === 0 && (
              <tr><td colSpan={4} className="muted">No scans for {MEAL_LABEL[meal].toLowerCase()} yet today.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ResultPanel({ scan, meal }: { scan: Scan | null; meal: Meal }) {
  if (!scan) {
    return (
      <div className="result ready" aria-live="polite">
        <span className="result-title">Ready to scan</span>
        <span className="result-detail">Hold the guest's tag to the scanner</span>
      </div>
    )
  }
  if (scan.result === 'denied') {
    return (
      <div className="result denied" aria-live="assertive">
        <span className="result-title">✗ Denied</span>
        <span className="result-name mono">Unit {scan.raw.trim()}</span>
        <span className="result-detail">Not on today's list</span>
      </div>
    )
  }
  const guests = scan.occupants === 1 ? '1 guest' : scan.occupants ? `${scan.occupants} guests` : ''
  return (
    <div className={`result ${scan.result}`} aria-live="assertive">
      <span className="result-title">{scan.result === 'granted' ? '✓ Granted' : '! Already scanned'}</span>
      <span className="result-name">{scan.clientName || 'Name not in list'}</span>
      <span className="result-detail">
        {scan.result === 'repeat' && scan.firstScannedAt
          ? `First scanned for ${MEAL_LABEL[meal].toLowerCase()} at ${localTime(scan.firstScannedAt)} · `
          : ''}
        Unit {scan.unitNo || '–'} · Rez {scan.rezNo}
        {guests && ` · ${guests}`}
      </span>
    </div>
  )
}
