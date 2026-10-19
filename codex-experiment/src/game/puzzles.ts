import { suits, type Card } from './types';
import { hasSolution } from './solver';

export function dealSolvableCards(random: () => number = Math.random, maxAttempts = 100): Card[] {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000) {
    throw new Error('Puzzle attempts must be between 1 and 1000.');
  }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const cards = dealCards(random);
    if (hasSolution(cards.map(card => card.value))) return cards;
  }
  throw new Error('Could not find a solvable puzzle. Please try New puzzle again.');
}

export function dealCards(random: () => number = Math.random): Card[] {
  const deck: Card[] = suits.flatMap(suit => Array.from({ length: 10 }, (_, index) => ({ value: index + 1, suit })));
  // Partial Fisher–Yates: sample four physical cards without replacement.
  for (let i = 0; i < 4; i++) {
    const j = i + Math.floor(random() * (deck.length - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 4);
}
