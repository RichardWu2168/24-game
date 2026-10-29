import { expect, test } from 'vitest'
import { DEFAULT_MESSAGE, gameReducer, initialGameState } from './gameReducer'

test('a replacement puzzle clears the previous round while preserving sound preference', () => {
  const previous = {
    ...initialGameState('old example'), expression: '3+5*4+1', solutions: ['(3+5*4+1)'],
    gameId: 'old', isCorrect: true, hasGotIt: true, isTimerRunning: false, isSoundEnabled: false,
  }
  const next = gameReducer(previous, { type: 'puzzleLoaded', startedAt: 1000, puzzle: { gameId: 'new', numbers: [1, 2, 3, 4] }, exampleExpression: '1 + 2 + 3 + 4' })
  expect(next).toMatchObject({
    cards: [1, 2, 3, 4], gameId: 'new', expression: '', solutions: [], message: DEFAULT_MESSAGE,
    isCorrect: null, hasGotIt: false, isTimerRunning: true, isSoundEnabled: false,
  })
})

test('an incorrect answer leaves a running timer active, while a correct answer stops it', () => {
  const state = initialGameState('example')
  const wrong = gameReducer(state, { type: 'answerChecked', stoppedAt: 2000, result: { valid: false, message: 'Try again.' } })
  expect(wrong.isTimerRunning).toBe(true)
  const correct = gameReducer(wrong, { type: 'answerChecked', stoppedAt: 2000, result: { valid: true, message: 'Correct!' } })
  expect(correct.isTimerRunning).toBe(false)
  expect(correct.isCorrect).toBe(true)
})

test('editing after feedback clears the feedback without restarting a stopped timer', () => {
  const stopped = gameReducer(initialGameState('example'), { type: 'gotIt', stoppedAt: 2000 })
  const edited = gameReducer(stopped, { type: 'expressionChanged', expression: '3 +' })
  expect(edited).toMatchObject({ expression: '3 +', message: DEFAULT_MESSAGE, isCorrect: null, isTimerRunning: false, hasGotIt: true })
})

test('showing solutions preserves the expression and stops the timer', () => {
  const previous = { ...initialGameState('example'), expression: '3 + 5' }
  const next = gameReducer(previous, { type: 'solutionsShown', stoppedAt: 2000, solutions: ['(3+5*4+1)'] })
  expect(next).toMatchObject({ expression: '3 + 5', isTimerRunning: false, message: 'Found 1 solution.' })
})
