import type { Card } from './types';

export function numberTokens(expression: string): string[] {
  return expression.match(/\d+/g) ?? [];
}

// Any number can be a temporary prefix while editing (e.g. deleting the 0 in
// 10 + 2). Submission still requires exact card values, checked by the parser.
function assignNumbers(expression: string, numbers: readonly number[], preferred: readonly number[] = []): number[] | null {
  if (expression.length > 200) return null;
  const tokens = numberTokens(expression);
  function match(index: number, available: number[]): number[] | null {
    if (index === tokens.length) return [];
    const candidates = [...available].sort((a, b) => {
      const rank = (card: number) => (String(numbers[card]) === tokens[index] ? 0 : 2) + (card === preferred[index] ? 0 : 1);
      return rank(a) - rank(b);
    });
    for (const card of candidates) {
      const token = tokens[index];
      if (!String(numbers[card]).startsWith(token)) continue;
      const rest = match(index + 1, available.filter(candidate => candidate !== card));
      if (rest !== null) return [card, ...rest];
    }
    return null;
  }
  return match(0, numbers.map((_, index) => index));
}

export function canEnterExpression(expression: string, numbers: readonly number[]): boolean {
  return assignNumbers(expression, numbers) !== null;
}

export function cardId(card: Card): string { return `${card.value}${card.suit}`; }

export function assignCardIds(expression: string, cards: readonly Card[], preferred: readonly string[] = []): string[] | null {
  const indices = assignNumbers(expression, cards.map(card => card.value), preferred.map(id => cards.findIndex(card => cardId(card) === id)));
  return indices?.map(index => cardId(cards[index])) ?? null;
}

export function backspaceExpression(expression: string): string {
  return expression.trimEnd().replace(/(?:\d+|[^\s])\s*$/, '').trimEnd();
}