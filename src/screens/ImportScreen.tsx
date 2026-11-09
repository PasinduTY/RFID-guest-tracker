import { useState } from 'react'
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

      {readError && <p className="notice danger">{readError}</p>}
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
  const today = localDate()
  const forToday = list?.dateFrom && list.dateFrom <= today && today <= (list.dateTo ?? list.dateFrom)

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
      <span className="meal-list-title">{MEAL_LABEL[meal]} list</span>
      {list ? (
        <>
          <span className={forToday ? 'meal-list-date' : 'meal-list-date warning-text'}>
            {dayRange(list.dateFrom, list.dateTo)} · {list.guestCount} guests
            {!forToday && ' · not today'}
          </span>
          <span className="muted small">
            {list.fileName} · loaded {new Date(list.importedAt).toLocaleString()}
          </span>
        </>
      ) : (
        <span className="muted">Not loaded</span>
      )}
      <span className="meal-list-action">
        Drop the {MEAL_LABEL[meal].toLowerCase()} report here or <span className="link">choose a file</span>
      </span>
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
  const notToday = r.dateFrom && !(r.dateFrom <= today && today <= (r.dateTo ?? r.dateFrom))
  const totalOk = r.totals && r.totals.occupants === r.sums.occupants
  const otherMeal = MEALS.find(m => m !== meal)!
  const sameAsOther = otherList && otherList.fileName === fileName && otherList.guestCount === r.guests.length

  return (
    <div className="preview">
      <h2>
        Check the {MEAL_LABEL[meal].toLowerCase()} list <span className="muted small">{fileName}</span>
      </h2>
      <div className="cards">
        <div className="card">
          <span className="card-label">Report date</span>
          <span className="card-value">{dayRange(r.dateFrom, r.dateTo)}</span>
        </div>
        <div className="card">
          <span className="card-label">Guests read</span>
          <span className="card-value">{r.guests.length}</span>
        </div>
        <div className={!r.totals ? 'card' : totalOk ? 'card success' : 'card danger'}>
          <span className="card-label">Report total (occupants)</span>
          <span className="card-value">
            {!r.totals ? 'Not in file' : totalOk ? `${r.totals.occupants} ✓ matches` : `${r.totals.occupants} ✗ read ${r.sums.occupants}`}
          </span>
        </div>
      </div>

      {r.errors.map(e => (
        <p key={e} className="notice danger">{e}</p>
      ))}
      {sameAsOther && (
        <p className="notice warning">
          This looks like the same file as the {MEAL_LABEL[otherMeal].toLowerCase()} list. Check you picked the{' '}
          {MEAL_LABEL[meal].toLowerCase()} report.
        </p>
      )}
      {notToday && (
        <p className="notice warning">
          This report is for {dayRange(r.dateFrom, r.dateTo)}, not today ({formatDay(today)}). Check it's the right file.
        </p>
      )}
      {r.warnings.map(w => (
        <p key={w} className="notice warning">{w}</p>
      ))}

      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        {r.errors.length === 0 && (
          <button className="primary" onClick={onConfirm}>
            Use as {MEAL_LABEL[meal].toLowerCase()} list
          </button>
        )}
      </div>

      {r.guests.length > 0 && (
        <div className="table-wrap tall">
          <table>
            <thead>
              <tr><th>Rez #</th><th>Unit #</th><th>Client name</th><th>Occ</th></tr>
            </thead>
            <tbody>
              {r.guests.map(g => (
                <tr key={g.rezNo}>
                  <td className="mono">{g.rezNo}</td>
                  <td>{g.unitNo}</td>
                  <td>{g.clientName}</td>
                  <td>{g.occupants ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
