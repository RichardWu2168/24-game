import type { Ref } from 'react'

interface Props {
  expression: string
  exampleExpression: string
  isSoundEnabled: boolean
  disabled: boolean
  inputRef: Ref<HTMLInputElement>
  onChange: (expression: string) => void
  onSubmit: () => Promise<void>
  onToggleSound: () => void
}

export function ExpressionEditor({ expression, exampleExpression, isSoundEnabled, disabled, inputRef, onChange, onSubmit, onToggleSound }: Props) {
  return <>
    <div className="expression-header">
      <label htmlFor="expression">Your expression:</label>
      <button type="button" className="sound-toggle" onClick={onToggleSound} aria-pressed={isSoundEnabled} aria-label={`Turn success sound ${isSoundEnabled ? 'off' : 'on'}`}>
        Sound: {isSoundEnabled ? 'On 🔊' : 'Off 🔇'}
      </button>
    </div>
    <input id="expression" ref={inputRef} type="text" disabled={disabled} value={expression}
      onChange={event => onChange(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter') void onSubmit() }}
      placeholder={`e.g. ${exampleExpression}`} />
  </>
}
