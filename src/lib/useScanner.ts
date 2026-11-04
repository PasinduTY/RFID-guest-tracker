import { useEffect, useRef } from 'react'
import { ScannerBuffer } from './scannerBuffer'

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

/**
 * Listens for the RFID scanner anywhere on the page, so it works wherever the cursor is.
 * Keys typed into a form field are left to that field.
 */
export function useScanner(onScan: (code: string) => void, enabled = true): void {
  const callback = useRef(onScan)
  useEffect(() => {
    callback.current = onScan
  })

  useEffect(() => {
    if (!enabled) return
    const buffer = new ScannerBuffer()
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.altKey || e.metaKey) return
      const wasPending = buffer.pending
      const code = buffer.push(e.key, e.timeStamp)
      if ((e.key === 'Enter' || e.key === 'Tab') && wasPending) e.preventDefault()
      if (code) callback.current(code)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
