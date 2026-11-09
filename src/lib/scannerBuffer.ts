/**
 * Max time between two keys from the scanner. A USB HID scanner "types" a whole tag in a few
 * milliseconds per key; a person is much slower, so slow keys are never taken as a scan.
 */
export const SCAN_KEY_GAP_MS = 100
/** Shortest tag accepted; Unit # can be short (e.g. "A-1"). */
const MIN_LENGTH = 2

/** Collects keystrokes from a keyboard-emulating RFID scanner and returns the code when Enter/Tab ends it. */
export class ScannerBuffer {
  private chars = ''
  private last = -Infinity
  private readonly maxGapMs: number

  constructor(maxGapMs = SCAN_KEY_GAP_MS) {
    this.maxGapMs = maxGapMs
  }

  /** Feed a KeyboardEvent.key with its timestamp (ms). Returns the scanned code when one completes. */
  push(key: string, time: number): string | null {
    const tooSlow = time - this.last > this.maxGapMs
    this.last = time

    if (key === 'Enter' || key === 'Tab') {
      const code = this.chars
      this.chars = ''
      return !tooSlow && code.length >= MIN_LENGTH ? code : null
    }
    if (key.length !== 1) return null // Shift, arrows, etc.

    this.chars = tooSlow ? key : this.chars + key
    return null
  }

  get pending(): boolean {
    return this.chars.length > 0
  }
}
