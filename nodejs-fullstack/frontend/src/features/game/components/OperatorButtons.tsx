interface Props {
  disabled: boolean
  onOperator: (operator: string) => void
  onBackspace: () => void
  onClear: () => void
}

export function OperatorButtons({ disabled, onOperator, onBackspace, onClear }: Props) {
  return <div className="operator-buttons" aria-label="Math operators">
    {['+', '−', '×', '÷', '(', ')'].map(operator =>
      <button key={operator} type="button" className="operator-button" disabled={disabled} onClick={() => onOperator(operator)}>{operator}</button>,
    )}
    <button type="button" className="operator-button" disabled={disabled} onClick={onBackspace}>⌫</button>
    <button type="button" className="operator-button clear-button" disabled={disabled} onClick={onClear}>Clear</button>
  </div>
}
