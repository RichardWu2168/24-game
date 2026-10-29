export function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds) % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatDuration(durationSeconds: number | null | undefined): string {
  if (durationSeconds == null) return '—'
  return formatTime(Math.max(0, Math.floor(durationSeconds)))
}
