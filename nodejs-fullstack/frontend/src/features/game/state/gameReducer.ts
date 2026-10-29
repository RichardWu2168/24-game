import type { AnswerResult, Puzzle } from '../game.types'

export const DEFAULT_MESSAGE = 'Use all four numbers to make 24.'

export interface GameState {
  cards: number[]
  gameId: string | null
  startedAt: number | null
  stoppedAt: number | null
  checkStoppedAt: number | null
  expression: string
  exampleExpression: string
  message: string
  isCorrect: boolean | null
  solutions: string[]
  isTimerRunning: boolean
  isSoundEnabled: boolean
  hasGotIt: boolean
  request: 'loading' | 'checking' | 'clearing' | 'timing' | null
}

export function initialGameState(exampleExpression: string): GameState {
  return {
    cards: [3, 4, 6, 8], gameId: null, startedAt: null, stoppedAt: null, checkStoppedAt: null, expression: '', exampleExpression,
    message: DEFAULT_MESSAGE, isCorrect: null, solutions: [],
    isTimerRunning: true, isSoundEnabled: true, hasGotIt: false, request: 'loading',
  }
}

type GameAction =
  | { type: 'requestStarted'; request: 'loading' | 'checking' | 'clearing' | 'timing'; stoppedAt?: number }
  | { type: 'requestFinished' }
  | { type: 'puzzleLoaded'; puzzle: Puzzle; exampleExpression: string; startedAt: number; stoppedAt?: number | null; hasGotIt?: boolean }
  | { type: 'expressionChanged'; expression: string }
  | { type: 'messageChanged'; message: string }
  | { type: 'answerChecked'; result: AnswerResult; stoppedAt: number }
  | { type: 'solutionsShown'; solutions: string[]; stoppedAt: number }
  | { type: 'gotIt'; stoppedAt: number }
  | { type: 'gotItFailed'; message: string }
  | { type: 'soundToggled' }

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'requestStarted': return { ...state, request: action.request, checkStoppedAt: action.request === 'checking' ? action.stoppedAt ?? null : null }
    case 'requestFinished': return { ...state, request: null, checkStoppedAt: null }
    case 'puzzleLoaded': return {
      ...state, cards: action.puzzle.numbers, gameId: action.puzzle.gameId,
      startedAt: action.startedAt, stoppedAt: action.stoppedAt ?? null,
      exampleExpression: action.exampleExpression, expression: '', solutions: [],
      message: DEFAULT_MESSAGE, isCorrect: null, isTimerRunning: action.stoppedAt == null, hasGotIt: action.hasGotIt ?? false,
    }
    case 'expressionChanged': return { ...state, expression: action.expression, message: DEFAULT_MESSAGE, isCorrect: null }
    case 'messageChanged': return { ...state, message: action.message, isCorrect: null }
    case 'answerChecked': return {
      ...state, message: action.result.message, isCorrect: action.result.valid,
      isTimerRunning: action.result.valid ? false : state.isTimerRunning,
      stoppedAt: action.result.valid ? state.stoppedAt ?? action.stoppedAt : state.stoppedAt,
    }
    case 'solutionsShown': return {
      ...state, solutions: action.solutions, isTimerRunning: false, isCorrect: null,
      stoppedAt: state.stoppedAt ?? action.stoppedAt,
      message: action.solutions.length === 0 ? 'No solution found for these cards.'
        : `Found ${action.solutions.length} solution${action.solutions.length === 1 ? '' : 's'}.`,
    }
    case 'gotIt': return { ...state, stoppedAt: action.stoppedAt, hasGotIt: true, isTimerRunning: false, isCorrect: null, message: 'Now type your answer and press Check Answer.' }
    case 'gotItFailed': return { ...state, stoppedAt: null, hasGotIt: false, isTimerRunning: true, message: action.message }
    case 'soundToggled': return { ...state, isSoundEnabled: !state.isSoundEnabled }
  }
}
