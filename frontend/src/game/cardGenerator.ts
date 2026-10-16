import { findSolution } from './gameSolver'

const MIN_CARD_VALUE = 1
const MAX_CARD_VALUE = 10
const MAX_ATTEMPTS = 100

/**
 * Generates four random cards that can make 24.
 * Returns null if no solvable combination is found within MAX_ATTEMPTS.
 */
export function generateSolvableCards(): number[] | null {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cards = Array.from(
      { length: 4 },
      () =>
        Math.floor(
          Math.random() * (MAX_CARD_VALUE - MIN_CARD_VALUE + 1),
        ) + MIN_CARD_VALUE,
    )

    if (findSolution(cards) !== null) {
      return cards
    }
  }

  return null
}