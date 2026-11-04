import { useRef, useState } from 'react'
import { formatDay, localDate } from '../lib/dates'
import { saveList, type GuestList } from '../lib/db'
import { readReportFile } from '../lib/readFile'
import { parseReport, type ParsedReport } from '../lib/report'

interface Props {
  activeList: GuestList | null
  onLoaded: () => void
}

interface Preview {
  fileName: string
  report: ParsedReport
}

const dayRange = (from: string | null, to: string | null) =>
  !from ? 'Unknown' : from === to || !to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`

export function ImportScreen({ activeList, onLoaded }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function open(file: File) {
    setReadError(null)
    setPreview(null)
    try {
      setPreview({ fileName: file.name, report: parseReport(await readReportFile(file)) })
    } catch {
      setReadError(`Couldn't read "${file.name}". Choose the .xlsx or .csv made from the Rex report.`)
    }
  }

  async function confirm() {
    if (!preview) return
    const r = preview.report
    await saveList(
      {
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

  const r = preview?.report
  const today = localDate()
  const notToday = r?.dateFrom && !(r.dateFrom <= today && today <= (r.dateTo ?? r.dateFrom))
  const totalOk = r?.totals && r.totals.occupants === r.sums.occupants

  return (
    <section className="screen">
      {activeList && !preview && (
        <div className="active-list">
          <span className="muted">Active list</span>
          <strong>{dayRange(activeList.dateFrom, activeList.dateTo)}</strong>
          <span>{activeList.guestCount} guests</span>
          <span className="muted">
            {activeList.fileName} · loaded {new Date(activeList.importedAt).toLocaleString()}
          </span>
        </div>
      )}

      <label
        className={dragging ? 'dropzone dragging' : 'dropzone'}
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) open(file)
        }}
      >
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) open(file)
            e.target.value = ''
          }}
        />
        <span className="dropzone-icon" aria-hidden="true">⇪</span>
        Drop the Rex report here (.xlsx or .csv) or <span className="link">choose a file</span>
      </label>

      {readError && <p className="notice danger">{readError}</p>}

      {r && preview && (
        <>
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
          {notToday && (
            <p className="notice warning">
              This report is for {dayRange(r.dateFrom, r.dateTo)}, not today ({formatDay(today)}). Check it's the right file.
            </p>
          )}
          {r.warnings.map(w => (
            <p key={w} className="notice warning">{w}</p>
          ))}

          <div className="actions">
            <button onClick={() => setPreview(null)}>Cancel</button>
            {r.errors.length === 0 ? (
              <button className="primary" onClick={confirm}>Use this list</button>
            ) : (
              <button className="primary" onClick={() => input.current?.click()}>Choose another file</button>
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
        </>
      )}
    </section>
  )
}
