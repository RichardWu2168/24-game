import { useCallback, useEffect, useEffectEvent, useReducer, useRef } from 'react'
import { ApiError } from '../../../lib/apiClient'
import { playSuccessSound } from '../../../utils/playSuccessSound'
import { gameApi } from '../api/gameApi'
import { getRandomExample } from '../logic/exampleGenerator'
import { findAllSolutions } from '../logic/gameSolver'
import { appendCard, appendOperator, canInsertCard, deleteLastToken, normalizeExpression, toApiExpression } from '../logic/expression'
import { gameReducer, initialGameState } from '../state/gameReducer'
import { useGameTimer } from './useGameTimer'
import { elapsedWholeSeconds, loadUiTimer, saveUiTimer } from '../logic/timerStorage'

export function useGame(onChanged: () => Promise<void>) {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState(getRandomExample([3, 4, 6, 8])))
  const inputRef = useRef<HTMLInputElement>(null)
  const gotItRef = useRef<HTMLButtonElement>(null)
  const pending = useRef(false)
  const version = useRef(0)
  const mounted = useRef(false)
  const isRequestPending = state.request !== null
  const timer = useGameTimer(state.isTimerRunning && state.request !== 'checking', state.startedAt, state.stoppedAt ?? state.checkStoppedAt)

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
      const uiTimer = loadUiTimer(puzzle.gameId, puzzle.capturedDurationSeconds)
      dispatch({ type: 'puzzleLoaded', puzzle, exampleExpression: getRandomExample(puzzle.numbers), startedAt: uiTimer.startedAt, stoppedAt: uiTimer.stoppedAt, hasGotIt: uiTimer.hasGotIt })
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

  async function gotIt() {
    if (pending.current || !state.gameId || !state.isTimerRunning || state.startedAt === null) return
    const stoppedAt = Date.now()
    const request = beginRequest()
    if (request === null) return
    dispatch({ type: 'gotIt', stoppedAt })
    dispatch({ type: 'requestStarted', request: 'timing' })
    try {
      const saved = await gameApi.recordGotIt(state.gameId, elapsedWholeSeconds(state.startedAt, stoppedAt))
      if (!isCurrent(request)) return
      const frozenAt = state.startedAt + saved.capturedDurationSeconds * 1000
      dispatch({ type: 'gotIt', stoppedAt: frozenAt })
      saveUiTimer({ gameId: state.gameId, startedAt: state.startedAt, stoppedAt: frozenAt, hasGotIt: true })
      inputRef.current?.focus()
      void onChanged()
    } catch (cause) {
      if (isCurrent(request)) dispatch({ type: 'gotItFailed', message: 'Unable to save your thinking time. Please press Got it again.' })
      console.error('Failed to save thinking time:', cause)
    } finally {
      finishRequest(request)
    }
  }

  function showSolutions() {
    if (pending.current || !state.gameId) return
    const stoppedAt = state.stoppedAt ?? Date.now()
    dispatch({ type: 'solutionsShown', solutions: findAllSolutions(state.cards), stoppedAt })
    if (state.startedAt !== null) saveUiTimer({ gameId: state.gameId, startedAt: state.startedAt, stoppedAt, hasGotIt: state.hasGotIt })
  }

  async function checkAnswer() {
    if (pending.current) return
    if (!state.gameId || state.startedAt === null) {
      dispatch({ type: 'messageChanged', message: 'Please start a new game before checking your answer.' })
      return
    }
    const request = beginRequest()
    if (request === null) return
    const expression = normalizeExpression(state.expression)
    const stoppedAt = state.stoppedAt ?? Date.now()
    const durationSeconds = elapsedWholeSeconds(state.startedAt, stoppedAt)
    dispatch({ type: 'expressionChanged', expression })
    dispatch({ type: 'requestStarted', request: 'checking', stoppedAt })
    try {
      const result = await gameApi.checkAnswer({ numbers: state.cards, expression: toApiExpression(expression), gameId: state.gameId, durationSeconds })
      if (!isCurrent(request)) return
      dispatch({ type: 'answerChecked', result, stoppedAt })
      if (result.valid) saveUiTimer({ gameId: state.gameId, startedAt: state.startedAt, stoppedAt, hasGotIt: state.hasGotIt })
      void onChanged()
      if (result.valid && state.isSoundEnabled && state.isCorrect !== true) {
        try { playSuccessSound() } catch (cause) { console.warn('Success sound unavailable:', cause) }
      }
    } catch (cause) {
      if (!isCurrent(request)) return
      if (!(cause instanceof ApiError)) console.error('Failed to check answer:', cause)
      dispatch({ type: 'messageChanged', message: cause instanceof ApiError ? cause.message : 'Unable to check your answer. Please try again.' })
    } finally {
      finishRequest(request)
    }
  }

  async function clearHistory(clear: () => Promise<boolean>) {
    if (pending.current) return
    const request = beginRequest()
    if (request === null) return
    dispatch({ type: 'requestStarted', request: 'clearing' })
    try {
      if (await clear() && isCurrent(request)) {
        void onChanged()
      }
    } finally {
      finishRequest(request)
    }
  }

  return {
    state, isRequestPending, elapsedSeconds: timer.elapsedSeconds, inputRef, gotItRef,
    changeExpression, insertCard, insertOperator, backspace, gotIt, showSolutions, checkAnswer, clearHistory,
    newGame: () => loadPuzzle(true),
    clearExpression: () => changeExpression(''),
    toggleSound: () => dispatch({ type: 'soundToggled' }),
  }
}
