import { describe, expect, it } from 'vitest'
import { generateSolvableCards } from './cardGenerator'
import { findSolution } from './gameSolver'
import { checkAnswer } from './gameLogic'

describe('generateSolvableCards', () => {
  it('generates exactly four cards', () => {
    const cards = generateSolvableCards()

    expect(cards).not.toBeNull()
    expect(cards).toHaveLength(4)
  })

  it('generates card values between 1 and 10', () => {
    const cards = generateSolvableCards()

    expect(cards).not.toBeNull()

    for (const card of cards!) {
      expect(card).toBeGreaterThanOrEqual(1)
      expect(card).toBeLessThanOrEqual(10)
      expect(Number.isInteger(card)).toBe(true)
    }
  })

  it('generates cards that can make 24', () => {
    const cards = generateSolvableCards()

    expect(cards).not.toBeNull()

    const solution = findSolution(cards!)

    expect(solution).not.toBeNull()
    expect(checkAnswer(solution!, cards!).valid).toBe(true)
  })
})