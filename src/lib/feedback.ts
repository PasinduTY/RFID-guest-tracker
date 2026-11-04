import type { ScanResult } from './db'

let ctx: AudioContext | null = null

/** Short beeps so the guard hears the result without looking: one high, two mid, or one low. */
export function beep(result: ScanResult): void {
  try {
    ctx ??= new AudioContext()
    const tones: Record<ScanResult, [freq: number, start: number, length: number][]> = {
      granted: [[1200, 0, 0.12]],
      repeat: [[700, 0, 0.1], [700, 0.16, 0.1]],
      denied: [[220, 0, 0.45]],
    }
    for (const [freq, start, length] of tones[result]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.type = result === 'denied' ? 'square' : 'sine'
      gain.gain.value = 0.15
      osc.connect(gain).connect(ctx.destination)
      const t = ctx.currentTime + start
      osc.start(t)
      osc.stop(t + length)
    }
  } catch {
    // No audio device: the screen still shows the result.
  }
}
