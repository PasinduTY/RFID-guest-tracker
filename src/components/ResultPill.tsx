import { RESULT_LABEL, type ScanResult } from '../lib/db'

export function ResultPill({ result }: { result: ScanResult }) {
  return <span className={`pill ${result}`}>{RESULT_LABEL[result]}</span>
}
