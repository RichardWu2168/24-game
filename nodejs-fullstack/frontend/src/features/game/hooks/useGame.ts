import { useCallback, useEffect, useEffectEvent, useReducer, useRef } from 'react'
import { ApiError } from '../../../lib/apiClient'
import { playSuccessSound } from '../../../utils/playSuccessSound'
import { gameApi } from '../api/gameApi'
import { getRandomExample } from '../logic/exampleGenerator'
import { findAllSolutions } from '../logic/gameSolver'
import { appendCard, appendOperator, canInsertCard, deleteLastToken, normalizeExpression, toApiExpression } from '../logic/expression'
import { gameReducer, initialGameState } from '../state/gameReducer'
import { useGameTimer } from './useGameTimer'

export function useGame(onChanged: () => Promise<void>) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState(getRandomExample([3, 4, 6, 8])))
  const inputRef = useRef<HTMLInputElement>(null)
  const gotItRef = useRef<HTMLButtonElement>(null)
  const pending = useRef(false)
  const version = useRef(0)
  const mounted = useRef(false)
  const isRequestPending = state.request !== null
  const timer = useGameTimer(state.isTimerRunning && !isRequestPending, state.gameId)

  useEffect(() => {
    if (state.isTimerRunning) gotItRef.current?.focus()
  }, [state.isTimerRunning, state.cards])

  function beginRequest(): number | null {
    if (pending.current) return null
    pending.current = true
    return ++version.current
  }

  function isCurrent(request: number): boolean {
    return mounted.current && version.current === request
  }

  function finishRequest(request: number) {
    if (isCurrent(request)) {
      pending.current = false
      dispatch({ type: 'requestFinished' })
    }
  }

  async function loadPuzzle(forceNew: boolean) {
    const request = beginRequest()
    if (request === null) return
    try {
      await Promise.resolve()
      if (!isCurrent(request)) return
      dispatch({ type: 'requestStarted', request: 'loading' })
      const puzzle = await gameApi.loadPuzzle(forceNew)
      if (!isCurrent(request)) return
      dispatch({ type: 'puzzleLoaded', puzzle, exampleExpression: getRandomExample(puzzle.numbers) })
      timer.reset()
      inputRef.current?.focus()
      void onChanged()
    } catch (cause) {
      if (!isCurrent(request)) return
      console.error('Failed to generate puzzle:', cause)
      dispatch({ type: 'messageChanged', message: 'Unable to generate a new puzzle. Please try again.' })
    } finally {
      finishRequest(request)
    }
  }

  const invalidate = useCallback(() => {
    mounted.current = false
    version.current++
    pending.current = false
  }, [])
  const initialize = useEffectEvent(() => { void loadPuzzle(false) })
  useEffect(() => {
    mounted.current = true
    let active = true
    void Promise.resolve().then(() => { if (active) initialize() })
    return () => { active = false; invalidate() }
  }, [invalidate])

  function changeExpression(expression: string) {
    if (pending.current || !state.gameId) return
    dispatch({ type: 'expressionChanged', expression: normalizeExpression(expression) })
  }

  function insertCard(number: number) {
    if (pending.current || !state.gameId) return
    if (!canInsertCard(state.expression, state.cards, number)) {
      dispatch({ type: 'messageChanged', message: 'That number has already been used as many times as it appears on the cards.' })
      return
    }
    changeExpression(appendCard(state.expression, number))
    inputRef.current?.focus()
  }

  function insertOperator(operator: string) {
    changeExpression(appendOperator(state.expression, operator))
    inputRef.current?.focus()
  }

  function backspace() {
    changeExpression(deleteLastToken(state.expression))
    inputRef.current?.focus()
  }

  function gotIt() {
    if (pending.current) return
    dispatch({ type: 'gotIt' })
    inputRef.current?.focus()
  }

  function showSolutions() {
    if (pending.current || !state.gameId) return
    dispatch({ type: 'solutionsShown', solutions: findAllSolutions(state.cards) })
  }

  async function checkAnswer() {
    if (pending.current) return
    if (!state.gameId) {
      dispatch({ type: 'messageChanged', message: 'Please start a new game before checking your answer.' })
      return
    }
    const request = beginRequest()
    if (request === null) return
    const expression = normalizeExpression(state.expression)
    dispatch({ type: 'expressionChanged', expression })
    dispatch({ type: 'requestStarted', request: 'checking' })
    try {
      const result = await gameApi.checkAnswer({ numbers: state.cards, expression: toApiExpression(expression), gameId: state.gameId })
      if (!isCurrent(request)) return
      if (result.valid && state.isSoundEnabled && state.isCorrect !== true) playSuccessSound()
      dispatch({ type: 'answerChecked', result })
      void onChanged()
    } catch (cause) {
      if (!isCurrent(request)) return
      if (!(cause instanceof ApiError)) console.error('Failed to check answer:', cause)
      dispatch({ type: 'messageChanged', message: cause instanceof ApiError ? cause.message : 'Unable to check your answer. Please try again.' })
    } finally {
      finishRequest(request)
    }
  }

  return {
    state, isRequestPending, elapsedSeconds: timer.elapsedSeconds, inputRef, gotItRef,
    changeExpression, insertCard, insertOperator, backspace, gotIt, showSolutions, checkAnswer,
    newGame: () => loadPuzzle(true),
    clearExpression: () => changeExpression(''),
    toggleSound: () => dispatch({ type: 'soundToggled' }),
  }
}
