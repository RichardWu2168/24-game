import { describe, expect, it } from 'vitest'
import { findSolution } from './gameSolver'
import { checkAnswer } from './gameLogic'
import { findAllSolutions } from './gameSolver'

describe('findSolution', () => {
  it('finds a solution for cards [3, 4, 6, 8]', () => {
    const cards = [3, 4, 6, 8]

    const solution = findSolution(cards)

    expect(solution).not.toBeNull()

    if (solution !== null) {
      expect(checkAnswer(solution, cards).valid).toBe(true)
    }
  })

  it('returns null when no solution exists', () => {
    const cards = [1, 1, 1, 1]

    const solution = findSolution(cards)

    expect(solution).toBeNull()
  })

  it('finds a solution for cards [1, 2, 3, 4]', () => {
    const cards = [1, 2, 3, 4]

    const solution = findSolution(cards)

    expect(solution).not.toBeNull()

    if (solution !== null) {
      expect(checkAnswer(solution, cards).valid).toBe(true)
    }
  })

  it('throws an error if given other than four numbers', () => {
    expect(() => findSolution([3, 4, 6])).toThrow(
      'The solver requires exactly four numbers.',
    )

    expect(() => findSolution([3, 4, 6, 8, 10])).toThrow(
      'The solver requires exactly four numbers.',
    )
  })

  it('does not use fractional intermediate results', () => {
    const cards = [1, 3, 4, 6]
    const solution = findSolution(cards)

    if (solution !== null) {
      expect(checkAnswer(solution, cards).valid).toBe(true)
    }
  })

})

describe('findAllSolutions', () => {
  it('finds multiple solutions for cards [3, 4, 6, 8]', () => {
    const cards = [3, 4, 6, 8]
    const solutions = findAllSolutions(cards)

    expect(solutions.length).toBeGreaterThan(1)

    for (const solution of solutions) {
      expect(checkAnswer(solution, cards).valid).toBe(true)
    }
  })

  it('returns no solutions for cards [1, 1, 1, 1]', () => {
    expect(findAllSolutions([1, 1, 1, 1])).toEqual([])
  })

  it('throws an error if given other than four numbers', () => {
    expect(() => findAllSolutions([3, 4, 6])).toThrow(
      'The solver requires exactly four numbers.',
    )
  })

})