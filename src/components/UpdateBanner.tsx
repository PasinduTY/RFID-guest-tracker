import { useRegisterSW } from 'virtual:pwa-register/react'

/** Shown when a new version has been downloaded. It never reloads by itself, so it can't interrupt a meal. */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version every hour while the app stays open.
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null
  return (
    <div className="notice accent update">
      A new version is ready. Reload between meals to use it.
      <button className="primary" onClick={() => updateServiceWorker(true)}>Reload</button>
      <button onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  )
}
