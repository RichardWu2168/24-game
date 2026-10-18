
import { findSolution } from './gameSolver'

const MIN_CARD_VALUE = 1
const MAX_CARD_VALUE = 10
const CARDS_PER_VALUE = 4
const HAND_SIZE = 4
const MAX_ATTEMPTS = 100

/**
 * Generates four random cards that can make 24.
 * Returns null if no solvable hand is found within MAX_ATTEMPTS.
 */
export function generateSolvableCards(): number[] | null {
  const deck = Array.from(
    { length: (MAX_CARD_VALUE - MIN_CARD_VALUE + 1) * CARDS_PER_VALUE },
    (_, index) =>
      MIN_CARD_VALUE + Math.floor(index / CARDS_PER_VALUE),
  )

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shuffledDeck = [...deck]

    // Shuffle the deck using Fisher-Yates.
    for (let i = shuffledDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
        ;[shuffledDeck[i], shuffledDeck[j]] = [
          shuffledDeck[j],
          shuffledDeck[i],
        ]
    }

    const cards = shuffledDeck.slice(0, HAND_SIZE)

    if (findSolution(cards) !== null) {
      return cards
    }
  }

  return null
}
