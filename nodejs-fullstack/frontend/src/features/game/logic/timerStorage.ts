const TIMER_KEY = '24-game-current-timer'

export interface UiTimer {
  gameId: string
  startedAt: number
  stoppedAt: number | null
  hasGotIt: boolean
}

export function saveUiTimer(timer: UiTimer) {
  try { localStorage.setItem(TIMER_KEY, JSON.stringify(timer)) } catch { /* Timing still works without storage. */ }
}

export function loadUiTimer(gameId: string, capturedDurationSeconds?: number | null): UiTimer {
  let previous: UiTimer | null = null
  try {
    const stored = JSON.parse(localStorage.getItem(TIMER_KEY) ?? 'null') as UiTimer | null
    if (stored?.gameId === gameId && Number.isFinite(stored.startedAt)
      && (stored.stoppedAt === null || Number.isFinite(stored.stoppedAt))) previous = stored
  } catch { /* An absent or invalid snapshot starts a new UI clock. */ }
  const now = Date.now()
  const timer: UiTimer = previous ?? { gameId, startedAt: now, stoppedAt: null, hasGotIt: false }
  if (capturedDurationSeconds != null) {
    timer.startedAt = previous?.startedAt ?? now - capturedDurationSeconds * 1000
    timer.stoppedAt = timer.startedAt + capturedDurationSeconds * 1000
    timer.hasGotIt = true
  }
  saveUiTimer(timer)
  return timer
}

export function elapsedWholeSeconds(startedAt: number, stoppedAt: number): number {
  return Math.max(0, Math.floor((stoppedAt - startedAt) / 1000))
}
