import { useLiveQuery } from 'dexie-react-hooks'
import {
  Check,
  Clock,
  FileSpreadsheet,
  Keyboard,
  Moon,
  RotateCcw,
  ScanLine,
  Sun,
  TriangleAlert,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatDay, localDate, localTime } from '../lib/dates'
import { db, MEAL_LABEL, MEALS, RESULT_LABEL, type GuestList, type Meal, type Scan } from '../lib/db'
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
  const [manualOpen, setManualOpen] = useState(false)
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

  const listCoversToday = list?.dateFrom && list.dateFrom <= today && today <= (list.dateTo ?? list.dateFrom)
  const remind = meal === 'breakfast' && now.getHours() >= DINNER_REMINDER_HOUR
  const mealName = MEAL_LABEL[meal].toLowerCase()

  const mealSwitch = (
    <div className="segmented meal-switch" role="radiogroup" aria-label="Meal">
      {MEALS.map(m => {
        const Icon = MEAL_ICON[m]
        return (
          <button
            key={m}
            role="radio"
            aria-checked={meal === m}
            className={meal === m ? `on ${m}` : m}
            onClick={() => onMealChange(m)}
          >
            <Icon size={18} aria-hidden="true" />
            {MEAL_LABEL[m]}
          </button>
        )
      })}
    </div>
  )

  if (!list) {
    return (
      <section className="screen">
        <div className="scan-head">{mealSwitch}</div>
        <div className="empty">
          <FileSpreadsheet className="empty-icon" size={32} aria-hidden="true" />
          <h2>Load today's {mealName} list</h2>
          <p className="muted">Scanning for {mealName} starts once its Rex report is imported.</p>
          <button className="primary" onClick={onImport}>
            <Upload size={16} aria-hidden="true" />
            Import {mealName} list
          </button>
        </div>
      </section>
    )
  }

  const total = list.guestCount
  const done = checkedIn ?? 0
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0

  return (
    <section className="screen">
      <div className="scan-head">
        {mealSwitch}
        <div className="counter" aria-label={`${done} of ${total} checked in`}>
          <div className="counter-line">
            <span>
              <span className="counter-value">{done}</span>of {total} checked in
            </span>
            <span>{percent}%</span>
          </div>
          <div className="progress" aria-hidden="true">
            <div style={{ width: `${percent}%` }} />
          </div>
          <span className={listCoversToday ? 'counter-sub' : 'counter-sub warning-text'}>
            {MEAL_LABEL[meal]} list · {list.dateFrom ? formatDay(list.dateFrom) : 'undated'}
          </span>
        </div>
      </div>

      {remind && (
        <p className="notice warning reminder">
          <Clock size={16} aria-hidden="true" />
          It's after {DINNER_REMINDER_HOUR}:00 and Breakfast is still selected.
          <button onClick={() => onMealChange('dinner')}>
            <Moon size={16} aria-hidden="true" />
            Switch to dinner
          </button>
        </p>
      )}
      {!listCoversToday && (
        <p className="notice warning">
          <TriangleAlert size={16} aria-hidden="true" />
          The {mealName} list isn't for today ({formatDay(today)}).
          <button onClick={onImport}>Load today's {mealName} report</button>
        </p>
      )}

      <ResultPanel scan={shown} meal={meal} />

      <div className="recent-head">
        <span className="section-label">Recent</span>
        {manualOpen ? (
          <form
            className="manual"
            onSubmit={e => {
              e.preventDefault()
              if (manual.trim()) check(manual)
              setManual('')
            }}
          >
            <input
              autoFocus
              value={manual}
              onChange={e => setManual(e.target.value)}
              placeholder="Enter Unit #"
              aria-label="Unit #"
            />
            <button type="submit">Check</button>
            <button type="button" className="ghost" aria-label="Close" onClick={() => setManualOpen(false)}>
              <X size={16} aria-hidden="true" />
            </button>
          </form>
        ) : (
          <button className="ghost" onClick={() => setManualOpen(true)}>
            <Keyboard size={16} aria-hidden="true" />
            Type a Unit # instead
          </button>
        )}
      </div>

      <ul className="recent">
        {recent?.map(s => (
          <li key={s.id}>
            <span className={`dot ${s.result}`} title={RESULT_LABEL[s.result]} />
            <span className="name">
              <span className={s.clientName ? '' : 'muted'}>{s.clientName || 'Not on list'}</span>
              {s.result === 'repeat' && s.firstScannedAt && (
                <span className="note"> · already scanned {localTime(s.firstScannedAt)}</span>
              )}
            </span>
            <span className="unit">{s.unitNo || '–'}</span>
            <span className="time">{localTime(s.scannedAt)}</span>
          </li>
        ))}
        {recent?.length === 0 && <li className="empty-row">No scans for {mealName} yet today.</li>}
      </ul>
    </section>
  )
}

const MEAL_ICON: Record<Meal, LucideIcon> = { breakfast: Sun, dinner: Moon }

function ResultPanel({ scan, meal }: { scan: Scan | null; meal: Meal }) {
  if (!scan) {
    return (
      <div className="result ready" aria-live="polite">
        <span className="result-icon">
          <ScanLine size={26} aria-hidden="true" />
        </span>
        <span className="result-title">Ready to scan</span>
        <span className="result-detail">Hold the guest's tag to the scanner</span>
      </div>
    )
  }
  if (scan.result === 'denied') {
    return (
      <div className="result denied" aria-live="assertive">
        <span className="result-icon">
          <X size={36} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <div className="result-body">
          <span className="result-title">Denied</span>
          <span className="result-name">Unit {scan.raw.trim()}</span>
          <span className="result-detail">Not on today's {MEAL_LABEL[meal].toLowerCase()} list</span>
        </div>
      </div>
    )
  }
  const guests = scan.occupants === 1 ? '1 guest' : scan.occupants ? `${scan.occupants} guests` : ''
  const granted = scan.result === 'granted'
  return (
    <div className={`result ${scan.result}`} aria-live="assertive">
      <span className="result-icon">
        {granted ? (
          <Check size={36} strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <RotateCcw size={32} strokeWidth={2.5} aria-hidden="true" />
        )}
      </span>
      <div className="result-body">
        <span className="result-title">
          {granted
            ? 'Granted'
            : `Already scanned${scan.firstScannedAt ? ` at ${localTime(scan.firstScannedAt)}` : ''}`}
        </span>
        <span className="result-name">{scan.clientName || 'Name not in list'}</span>
        <span className="result-detail">
          Unit {scan.unitNo || '–'} · Rez {scan.rezNo}
          {guests && ` · ${guests}`}
        </span>
      </div>
    </div>
  )
}
