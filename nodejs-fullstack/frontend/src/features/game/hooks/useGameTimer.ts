import { useCallback, useEffect, useState } from 'react'

export function useGameTimer(running: boolean, gameId: string | null) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!running || !gameId) return
    const interval = window.setInterval(() => setElapsedSeconds(seconds => seconds + 1), 1000)
    return () => window.clearInterval(interval)
  }, [running, gameId])
  const reset = useCallback(() => setElapsedSeconds(0), [])
  return { elapsedSeconds, reset }
}
