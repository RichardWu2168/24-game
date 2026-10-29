export function normalizeExpression(expression: string): string {
  return expression.replace(/[xX*]/g, '×').replace(/\//g, '÷')
}

export function toApiExpression(expression: string): string {
  return expression.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
}

export function canInsertCard(expression: string, cards: number[], number: number): boolean {
  const used = (expression.match(/\d+/g) ?? []).filter(value => value === String(number)).length
  return used < cards.filter(card => card === number).length
}

export function appendCard(expression: string, number: number): string {
  const trimmed = expression.trimEnd()
  if (!trimmed) return String(number)
  const last = trimmed[trimmed.length - 1]
  return `${trimmed}${['+', '−', '×', '÷', '(', '/', '*'].includes(last) ? ' ' : '  '}${number}`
}

export function appendOperator(expression: string, operator: string): string {
  const trimmed = expression.trimEnd()
  if (!trimmed) return operator === '(' ? '( ' : ''
  return `${trimmed} ${operator} `
}

export function deleteLastToken(expression: string): string {
  const trimmed = expression.trimEnd()
  const withoutNumber = trimmed.replace(/\d+$/, '')
  return (withoutNumber !== trimmed ? withoutNumber : trimmed.slice(0, -1)).trimEnd()
}
