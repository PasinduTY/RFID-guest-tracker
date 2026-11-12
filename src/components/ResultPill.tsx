import { RESULT_LABEL, type ScanResult } from '../lib/db'

export function ResultPill({ result }: { result: ScanResult }) {
  return (
    <span className={`pill ${result}`}>
      <span className={`dot ${result}`} aria-hidden="true" />
      {RESULT_LABEL[result]}
    </span>
  )
}
