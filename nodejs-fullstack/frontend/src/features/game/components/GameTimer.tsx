import type { Ref } from 'react'
import { formatTime } from '../../../utils/formatTime'

interface Props {
  elapsedSeconds: number
  hasGotIt: boolean
  disabled: boolean
  buttonRef: Ref<HTMLButtonElement>
  onGotIt: () => void
}

export function GameTimer({ elapsedSeconds, hasGotIt, disabled, buttonRef, onGotIt }: Props) {
  return <>
    <div className="game-timer" role="timer" aria-label="Elapsed time">
      <span className="timer-label">{hasGotIt ? 'Thinking time' : 'Time'}</span>
      <span className="timer-value">{formatTime(elapsedSeconds)}</span>
    </div>
    <div className="got-it-container">
      <button ref={buttonRef} type="button" className="got-it-button" onClick={onGotIt} disabled={disabled} aria-keyshortcuts="G">
        <u>G</u>ot it! <kbd>Space</kbd>
      </button>
      <span className="got-it-hint">or press Space</span>
    </div>
  </>
}
