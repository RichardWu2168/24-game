import { useEffect, useState } from 'react'

// Interval callbacks only repaint the clock. Elapsed time always comes from
// timestamps, so background-tab throttling cannot lose elapsed time.
export function useGameTimer(running: boolean, startedAt: number | null, stoppedAt: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running || startedAt === null) return
    const update = () => setNow(Date.now())
    const interval = window.setInterval(update, 100)
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
    }
  }, [running, startedAt])
  return { elapsedSeconds: startedAt === null ? 0 : Math.max(0, ((stoppedAt ?? now) - startedAt) / 1000) }
}
