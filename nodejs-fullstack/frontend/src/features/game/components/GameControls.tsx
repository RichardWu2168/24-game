interface Props {
  disabled: boolean
  newGameDisabled: boolean
  onCheck: () => Promise<void>
  onShowSolutions: () => void
  onNewGame: () => Promise<void>
}

export function GameControls({ disabled, newGameDisabled, onCheck, onShowSolutions, onNewGame }: Props) {
  return <div className="button-container">
    <button type="button" onClick={() => void onCheck()} disabled={disabled} aria-keyshortcuts="C"><u>C</u>heck Answer</button>
    <button type="button" className="secondary-button" onClick={onShowSolutions} disabled={disabled} aria-keyshortcuts="S"><u>S</u>how Solutions</button>
    <button type="button" className="secondary-button" onClick={() => void onNewGame()} disabled={newGameDisabled} aria-keyshortcuts="N"><u>N</u>ew Game</button>
  </div>
}
