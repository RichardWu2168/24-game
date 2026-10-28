import type { AnswerResult, Puzzle } from '../game.types'

export const DEFAULT_MESSAGE = 'Use all four numbers to make 24.'

export interface GameState {
  cards: number[]
  gameId: string | null
  expression: string
  exampleExpression: string
  message: string
  isCorrect: boolean | null
  solutions: string[]
  isTimerRunning: boolean
  isSoundEnabled: boolean
  hasGotIt: boolean
  request: 'loading' | 'checking' | null
}

export function initialGameState(exampleExpression: string): GameState {
  return {
    cards: [3, 4, 6, 8], gameId: null, expression: '', exampleExpression,
    message: DEFAULT_MESSAGE, isCorrect: null, solutions: [],
    isTimerRunning: true, isSoundEnabled: true, hasGotIt: false, request: 'loading',
  }
}

type GameAction =
  | { type: 'requestStarted'; request: 'loading' | 'checking' }
  | { type: 'requestFinished' }
  | { type: 'puzzleLoaded'; puzzle: Puzzle; exampleExpression: string }
  | { type: 'expressionChanged'; expression: string }
  | { type: 'messageChanged'; message: string }
  | { type: 'answerChecked'; result: AnswerResult }
  | { type: 'solutionsShown'; solutions: string[] }
  | { type: 'gotIt' }
  | { type: 'soundToggled' }

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'requestStarted': return { ...state, request: action.request }
    case 'requestFinished': return { ...state, request: null }
    case 'puzzleLoaded': return {
      ...state, cards: action.puzzle.numbers, gameId: action.puzzle.gameId,
      exampleExpression: action.exampleExpression, expression: '', solutions: [],
      message: DEFAULT_MESSAGE, isCorrect: null, isTimerRunning: true, hasGotIt: false,
    }
    case 'expressionChanged': return { ...state, expression: action.expression, message: DEFAULT_MESSAGE, isCorrect: null }
    case 'messageChanged': return { ...state, message: action.message, isCorrect: null }
    case 'answerChecked': return {
      ...state, message: action.result.message, isCorrect: action.result.valid,
      isTimerRunning: action.result.valid ? false : state.isTimerRunning,
    }
    case 'solutionsShown': return {
      ...state, solutions: action.solutions, isTimerRunning: false, isCorrect: null,
      message: action.solutions.length === 0 ? 'No solution found for these cards.'
        : `Found ${action.solutions.length} solution${action.solutions.length === 1 ? '' : 's'}.`,
    }
    case 'gotIt': return { ...state, hasGotIt: true, isTimerRunning: false, isCorrect: null, message: 'Now type your answer and press Check Answer.' }
    case 'soundToggled': return { ...state, isSoundEnabled: !state.isSoundEnabled }
  }
}
