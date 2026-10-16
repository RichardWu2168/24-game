import { describe, expect, it } from 'vitest'
import { checkAnswer } from './gameLogic'

describe('checkAnswer', () => {
  const cards = [3, 4, 6, 8]

  it('accepts a correct expression', () => {
    const result = checkAnswer('(8 - 6) * (3 * 4)', cards)

    expect(result.valid).toBe(true)
  })

  it('rejects an expression that does not equal 24', () => {
    const result = checkAnswer('3 + 4 + 6 + 8', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an expression that does not use all four cards', () => {
    const result = checkAnswer('3 * 4 + 6', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an expression that repeats a card', () => {
    const result = checkAnswer('3 + 3 + 6 + 8', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects a number that is not on the cards', () => {
    const result = checkAnswer('3 + 4 + 6 + 10', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an invalid expression', () => {
    const result = checkAnswer('3 + + 4', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects division by zero', () => {
    const result = checkAnswer('3 / 0 + 4 + 6', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an extra closing parenthesis', () => {
    const result = checkAnswer('(8 - 6) * (3 * 4))', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an extra number', () => {
    const result = checkAnswer('(8 - 6) * (3 * 4) * 3', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an extra opening parenthesis', () => {
    const result = checkAnswer('((8 - 6) * (3 * 4)', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects missing closing parentheses', () => {
    const result = checkAnswer('(8 - 6) * (3 * 4', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects consecutive operators', () => {
    const result = checkAnswer('3 + * 4 + 6 + 8', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an expression ending with an operator', () => {
    const result = checkAnswer('3 + 4 + 6 + 8 +', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an expression containing only operators', () => {
    const result = checkAnswer('+ * - /', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an empty expression', () => {
    const result = checkAnswer('', cards)

    expect(result.valid).toBe(false)
  })

  it('rejects an expression containing only spaces', () => {
    const result = checkAnswer('   ', cards)

    expect(result.valid).toBe(false)
  })

})