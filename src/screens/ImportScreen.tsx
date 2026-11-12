import {
  CalendarDays,
  Check,
  CircleAlert,
  FileSpreadsheet,
  TriangleAlert,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { MealIllustration } from '../components/MealIllustration'
import { formatDay, localDate } from '../lib/dates'
import { MEAL_LABEL, MEALS, saveList, type GuestList, type Meal } from '../lib/db'
import { readReportFile } from '../lib/readFile'
import { parseReport, type ParsedReport } from '../lib/report'

interface Props {
  /** Active list per meal; breakfast and dinner each have their own Rex report. */
  lists: Record<Meal, GuestList | null>
  onLoaded: () => void
}

interface Preview {
  meal: Meal
  fileName: string
  report: ParsedReport
}

const dayRange = (from: string | null, to: string | null) =>
  !from ? 'Unknown' : from === to || !to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`

const coversToday = (from: string | null, to: string | null, today: string) =>
  !!from && from <= today && today <= (to ?? from)

export function ImportScreen({ lists, onLoaded }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [readError, setReadError] = useState<string | null>(null)

  async function open(meal: Meal, file: File) {
    setReadError(null)
    setPreview(null)
    try {
      setPreview({ meal, fileName: file.name, report: parseReport(await readReportFile(file)) })
    } catch {
      setReadError(`Couldn't read "${file.name}". Choose the .xlsx or .csv made from the Rex report.`)
    }
  }

  async function confirm() {
    if (!preview) return
    const r = preview.report
    await saveList(
      {
        meal: preview.meal,
        fileName: preview.fileName,
        importedAt: new Date().toISOString(),
        property: r.property,
        dateFrom: r.dateFrom,
        dateTo: r.dateTo,
        generatedAt: r.generatedAt,
        guestCount: r.guests.length,
        totalOccupants: r.totals?.occupants ?? null,
      },
      r.guests,
    )
    setPreview(null)
    onLoaded()
  }

  return (
    <section className="screen">
      <header className="page-head">
        <h2>Guest lists</h2>
        <p className="muted">Load today's Rex meal reports. Breakfast and dinner each have their own list.</p>
      </header>

      <div className="meal-lists">
        {MEALS.map(meal => (
          <MealListCard
            key={meal}
            meal={meal}
            list={lists[meal]}
            selected={preview?.meal === meal}
            onFile={file => open(meal, file)}
          />
        ))}
      </div>

      {readError && (
        <p className="notice danger">
          <CircleAlert size={16} aria-hidden="true" />
          {readError}
        </p>
      )}
      {preview && (
        <PreviewPanel
          preview={preview}
          otherList={lists[MEALS.find(m => m !== preview.meal)!]}
          onCancel={() => setPreview(null)}
          onConfirm={confirm}
        />
      )}
    </section>
  )
}

function MealListCard({
  meal,
  list,
  selected,
  onFile,
}: {
  meal: Meal
  list: GuestList | null
  selected: boolean
  onFile: (file: File) => void
}) {
  const [dragging, setDragging] = useState(false)
  const forToday = list && coversToday(list.dateFrom, list.dateTo, localDate())
  const badge = !list
    ? { className: 'badge', text: 'Not loaded' }
    : forToday
      ? { className: 'badge success', text: 'Ready' }
      : { className: 'badge warning', text: 'Not today' }

  return (
    <label
      className={['meal-list', meal, dragging && 'dragging', selected && 'selected'].filter(Boolean).join(' ')}
      onDragOver={e => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
      <div className="meal-list-head">
        <MealIllustration meal={meal} size={60} />
        <span className="meal-list-title">
          {MEAL_LABEL[meal]}
          <span className="meal-list-sub">Guest list</span>
        </span>
        <span className={badge.className}>{badge.text}</span>
      </div>

      {list ? (
        <div className="meal-list-body">
          <span className="meal-list-count">
            {list.guestCount}
            <span> guests</span>
          </span>
          <span className="meal-list-meta">
            <CalendarDays size={14} aria-hidden="true" />
            {dayRange(list.dateFrom, list.dateTo)}
          </span>
          <span className="meal-list-meta">
            <FileSpreadsheet size={14} aria-hidden="true" />
            <span className="file-name">{list.fileName}</span>
            <span className="faint">· loaded {new Date(list.importedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </span>
        </div>
      ) : (
        <div className="meal-list-body empty-body">
          <span className="muted">No {MEAL_LABEL[meal].toLowerCase()} list yet. Scanning needs one.</span>
        </div>
      )}

      <div className="meal-list-foot">
        <span className="button-like">
          <Upload size={16} aria-hidden="true" />
          {list ? 'Replace file' : 'Upload file'}
        </span>
        <span className="faint">or drop .xlsx / .csv here</span>
      </div>
    </label>
  )
}

function PreviewPanel({
  preview,
  otherList,
  onCancel,
  onConfirm,
}: {
  preview: Preview
  otherList: GuestList | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const { meal, fileName, report: r } = preview
  const today = localDate()
  const notToday = r.dateFrom && !coversToday(r.dateFrom, r.dateTo, today)
  const totalOk = r.totals && r.totals.occupants === r.sums.occupants
  const otherMeal = MEALS.find(m => m !== meal)!
  const sameAsOther = otherList && otherList.fileName === fileName && otherList.guestCount === r.guests.length
  const mealName = MEAL_LABEL[meal].toLowerCase()

  return (
    <div className={`preview ${meal}`}>
      <div className="preview-head">
        <MealIllustration meal={meal} size={44} />
        <div className="preview-title">
          <h2>Check the {mealName} list</h2>
          <span className="meal-list-meta">
            <FileSpreadsheet size={14} aria-hidden="true" />
            <span className="file-name">{fileName}</span>
          </span>
        </div>
        <button className="ghost" aria-label="Cancel" onClick={onCancel}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="stats">
        <div className={notToday ? 'stat warning' : 'stat'}>
          <span className="stat-label">
            <CalendarDays size={14} aria-hidden="true" />
            Report date
          </span>
          <span className="stat-value">{dayRange(r.dateFrom, r.dateTo)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Users size={14} aria-hidden="true" />
            Guests read
          </span>
          <span className="stat-value">{r.guests.length}</span>
        </div>
        <div className={!r.totals ? 'stat' : totalOk ? 'stat success' : 'stat danger'}>
          <span className="stat-label">
            {totalOk ? <Check size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
            Report total
          </span>
          <span className="stat-value">
            {!r.totals
              ? 'Not in file'
              : totalOk
                ? `${r.totals.occupants} · matches`
                : `${r.totals.occupants} · read ${r.sums.occupants}`}
          </span>
        </div>
      </div>

      {(r.errors.length > 0 || sameAsOther || notToday || r.warnings.length > 0) && (
        <div className="notices">
          {r.errors.map(e => (
            <p key={e} className="notice danger">
              <CircleAlert size={16} aria-hidden="true" />
              {e}
            </p>
          ))}
          {sameAsOther && (
            <p className="notice warning">
              <TriangleAlert size={16} aria-hidden="true" />
              This looks like the same file as the {MEAL_LABEL[otherMeal].toLowerCase()} list. Check you picked the{' '}
              {mealName} report.
            </p>
          )}
          {notToday && (
            <p className="notice warning">
              <TriangleAlert size={16} aria-hidden="true" />
              This report is for {dayRange(r.dateFrom, r.dateTo)}, not today ({formatDay(today)}).
            </p>
          )}
          {r.warnings.map(w => (
            <p key={w} className="notice warning">
              <TriangleAlert size={16} aria-hidden="true" />
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Above the table, so confirming never needs scrolling past a long list. */}
      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        {r.errors.length === 0 && (
          <button className="primary" onClick={onConfirm}>
            <Check size={16} aria-hidden="true" />
            Use as {mealName} list
          </button>
        )}
      </div>

      {r.guests.length > 0 && (
        <div className="table-wrap tall">
          <table>
            <thead>
              <tr><th>Rez #</th><th>Unit #</th><th>Client name</th><th className="num">Occ</th></tr>
            </thead>
            <tbody>
              {r.guests.map(g => (
                <tr key={g.rezNo}>
                  <td className="mono muted">{g.rezNo}</td>
                  <td className="mono">{g.unitNo}</td>
                  <td>{g.clientName}</td>
                  <td className="num">{g.occupants ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
