import { useEffect, useEffectEvent } from 'react'

interface Shortcuts {
  checkAnswer: () => Promise<void>
  showSolutions: () => void
  newGame: () => Promise<void>
  gotIt: () => void
  isTimerRunning: boolean
}

export function useGameShortcuts(actions: Shortcuts) {
  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return
    if (event.code === 'KeyC') { event.preventDefault(); void actions.checkAnswer() }
    else if (event.code === 'KeyS') { event.preventDefault(); actions.showSolutions() }
    else if (event.code === 'KeyN') { event.preventDefault(); void actions.newGame() }
    else if (event.code === 'KeyG') {
      if (actions.isTimerRunning) { event.preventDefault(); actions.gotIt() }
    } else {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.code === 'Space') {
        event.preventDefault()
        if (actions.isTimerRunning) actions.gotIt()
      }
    }
  })

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleShortcut(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
}
