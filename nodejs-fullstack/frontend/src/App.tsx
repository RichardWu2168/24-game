import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'

import { formatTime } from './utils/formatTime'
import { playSuccessSound } from './utils/playSuccessSound'
import { findAllSolutions } from './game/gameSolver'
import { getRandomExample } from './game/exampleGenerator'
import './App.css'


type GameStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'

interface GameHistoryItem {
  id: string
  numbers: number[]
  status: GameStatus
  createdAt: string
  completedAt: string | null
  attemptCount: number
}

interface GameHistoryResponse {
  games: GameHistoryItem[]
  nextCursor: string | null
  hasMore: boolean
}

const DEFAULT_MESSAGE = 'Use all four numbers to make 24.'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const SESSION_STORAGE_KEY = '24-game-session-id'

function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY)

  if (!sessionId) {
    sessionId = crypto.randomUUID()
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId)
  }

  return sessionId
}

function App() {
  const [cards, setCards] = useState<number[]>([3, 4, 6, 8])
  const [gameId, setGameId] = useState<string | null>(null)
  const [games, setGames] = useState<GameHistoryItem[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [expression, setExpression] = useState('')
  const expressionInputRef = useRef<HTMLInputElement>(null)
  const [exampleExpression, setExampleExpression] = useState(() =>
    getRandomExample(cards),
  )
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [solutions, setSolutions] = useState<string[]>([])
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(true)
  const [isSoundEnabled, setIsSoundEnabled] = useState(true)
  const [hasGotIt, setHasGotIt] = useState(false)
  const gotItButtonRef = useRef<HTMLButtonElement>(null)
  const requestPending = useRef(false)
  const requestVersion = useRef(0)
  const mounted = useRef(false)
  const historyVersion = useRef(0)
  const [isRequestPending, setIsRequestPending] = useState(true)


  useEffect(() => {
    if (isTimerRunning) {
      gotItButtonRef.current?.focus()
    }
  }, [isTimerRunning, cards])

  useEffect(() => {
    if (!isTimerRunning || isRequestPending || !gameId) {
      return
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1)
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isTimerRunning, isRequestPending, gameId])

  const loadGameHistory = useCallback(async () => {
    const version = ++historyVersion.current
    await Promise.resolve()
    if (!mounted.current || version !== historyVersion.current) return
    setIsHistoryLoading(true)
    setHistoryError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/games`, {
        headers: {
          'X-Session-Id': getSessionId(),
        },
      })

      if (!response.ok) {
        throw new Error('Failed to load game history.')
      }

      const data: GameHistoryResponse = await response.json()
      if (!mounted.current || version !== historyVersion.current) return
      setGames(data.games)
    } catch (error) {
      if (!mounted.current || version !== historyVersion.current) return
      console.error('Failed to load game history:', error)
      setHistoryError('Unable to load game history. Please try again.')
    } finally {
      if (mounted.current && version === historyVersion.current) setIsHistoryLoading(false)
    }
  }, [])

  function resetFeedback() {
    setMessage(DEFAULT_MESSAGE)
    setIsCorrect(null)
  }

  function handleCardClick(number: number) {
    if (requestPending.current || !gameId) return
    const currentNumbers = expression.match(/\d+/g) ?? []
    const cardNumber = String(number)

    // Do not insert more numbers than the four cards provide.
    const availableCount = cards.filter(
      (card) => card === number,
    ).length

    const usedCount = currentNumbers.filter(
      (value) => value === cardNumber,
    ).length

    if (usedCount >= availableCount) {
      setMessage('That number has already been used as many times as it appears on the cards.')
      return
    }

    // Use two spaces between numbers, but one space after an operator.
    setExpression((current) => {
      const trimmed = current.trimEnd()

      if (!trimmed) {
        return String(number)
      }

      const lastChar = trimmed[trimmed.length - 1]

      if (['+', '−', '×', '÷', '(', '/', '*'].includes(lastChar)) {
        return `${trimmed} ${number}`
      }

      return `${trimmed}  ${number}`
    })

    resetFeedback()
    expressionInputRef.current?.focus()

  }

  function handleGotIt() {
    if (requestPending.current) return
    setIsTimerRunning(false)
    setHasGotIt(true)
    setMessage('Now type your answer and press Check Answer.')
    setIsCorrect(null)
    expressionInputRef.current?.focus()
  }


  async function newGame() {
    await loadPuzzle(true)
  }

  async function loadPuzzle(forceNew: boolean) {
    if (requestPending.current) return
    requestPending.current = true
    const version = ++requestVersion.current
    try {
      await Promise.resolve()
      if (!mounted.current || version !== requestVersion.current) return
      setIsRequestPending(true)
      const response = await fetch(`${API_BASE_URL}/api/puzzle`, {
        method: forceNew ? 'POST' : 'GET',
        headers: {
          'X-Session-Id': getSessionId(),
        },
      })

      if (!response.ok) {
        throw new Error('Failed to generate a new puzzle.')
      }

      const data: { numbers: number[]; gameId: string } = await response.json()
      if (!mounted.current || version !== requestVersion.current) return
      const newCards = data.numbers
      setGameId(data.gameId)

      setCards(newCards)
      setElapsedSeconds(0)
      setIsTimerRunning(true)
      setHasGotIt(false)
      setExampleExpression(getRandomExample(newCards))
      setSolutions([])
      setExpression('')
      setMessage(DEFAULT_MESSAGE)
      setIsCorrect(null)
      expressionInputRef.current?.focus()
      void loadGameHistory()
    } catch (error) {
      if (!mounted.current || version !== requestVersion.current) return
      console.error('Failed to generate puzzle:', error)
      setMessage('Unable to generate a new puzzle. Please try again.')
      setIsCorrect(null)
    } finally {
      if (mounted.current && version === requestVersion.current) {
        requestPending.current = false
        setIsRequestPending(false)
      }
    }
  }

  const invalidateRequests = useCallback(() => {
    mounted.current = false
    requestVersion.current++
    historyVersion.current++
    requestPending.current = false
  }, [])

  const initializeGame = useEffectEvent(() => {
    void loadPuzzle(false)
    void loadGameHistory()
  })

  useEffect(() => {
    mounted.current = true
    const version = ++requestVersion.current
    void Promise.resolve().then(() => {
      if (!mounted.current || version !== requestVersion.current) return
      initializeGame()
    })
    return invalidateRequests
  }, [invalidateRequests])


  function showSolution() {
    if (requestPending.current || !gameId) return
    const allSolutions = findAllSolutions(cards)

    setIsTimerRunning(false)
    setSolutions(allSolutions)
    setIsCorrect(null)

    if (allSolutions.length === 0) {
      setMessage('No solution found for these cards.')
      return
    }

    setMessage(`Found ${allSolutions.length} solution${allSolutions.length === 1 ? '' : 's'}.`,)
  }


  async function handleCheckAnswer() {
    if (requestPending.current) return
    if (!gameId) {
      setMessage('Please start a new game before checking your answer.')
      setIsCorrect(null)
      return
    }

    const normalizedExpression = expression.replace(/[xX*]/g, '×')

    setExpression(normalizedExpression)
    requestPending.current = true
    setIsRequestPending(true)
    const version = ++requestVersion.current

    try {
      const response = await fetch(`${API_BASE_URL}/api/check-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': getSessionId(),
        },
        body: JSON.stringify({
          numbers: cards,
          expression: normalizedExpression
            .replace(/−/g, '-')
            .replace(/×/g, '*')
            .replace(/÷/g, '/'),
          gameId,
        }),
      })

      const result: {
        valid: boolean
        message: string
        value?: number
      } = await response.json()
      if (!mounted.current || version !== requestVersion.current) return

      if (!response.ok) {
        setMessage(result.message || 'Unable to check your answer. Please try again.')
        setIsCorrect(null)
        return
      }

      if (result.valid) {
        setIsTimerRunning(false)

        // Play the sound only when the answer changes from not-correct to correct.
        if (isSoundEnabled && isCorrect !== true) {
          playSuccessSound()
        }
      }

      setMessage(result.message)
      setIsCorrect(result.valid)
      void loadGameHistory()
    } catch (error) {
      if (!mounted.current || version !== requestVersion.current) return
      console.error('Failed to check answer:', error)
      setMessage('Unable to check your answer. Please try again.')
      setIsCorrect(null)
    } finally {
      if (mounted.current && version === requestVersion.current) {
        requestPending.current = false
        setIsRequestPending(false)
      }
    }
  }


  function handleExpressionKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Enter') {
      handleCheckAnswer()
    }
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat
      ) {
        return
      }

      if (event.code === 'KeyC') {
        event.preventDefault()
        handleCheckAnswer()
      } else if (event.code === 'KeyS') {
        event.preventDefault()
        showSolution()
      } else if (event.code === 'KeyN') {
        event.preventDefault()
        newGame()
      } else if (event.code === 'KeyG') {
        if (isTimerRunning) {
          event.preventDefault()
          handleGotIt()
        }
      } else {
        const target = event.target
        if (
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
        ) {
          return
        }

        if (event.code === 'Space') {
          event.preventDefault()
          if (!event.repeat && isTimerRunning) {
            handleGotIt()
          }
          return
        }
      }
    }

    window.addEventListener('keydown', handleShortcut)

    return () => {
      window.removeEventListener('keydown', handleShortcut)
    }
  })

  return (
    <main className="game-container">
      <header className="game-header">
        <h1>Math 24 Game</h1>
        <p>Use four numbers and mathematical operations to make 24!</p>
      </header>

      <div className="game-timer" role="timer" aria-label="Elapsed time">
        <span className="timer-label">{hasGotIt ? 'Thinking time' : 'Time'}</span>
        <span className="timer-value">{formatTime(elapsedSeconds)}</span>
      </div>

      <div className="got-it-container">
        <button
          ref={gotItButtonRef}
          type="button"
          className="got-it-button"
          onClick={handleGotIt}
          disabled={!isTimerRunning || isRequestPending || !gameId}
          aria-keyshortcuts="G"
        >
          <u>G</u>ot it! <kbd>Space</kbd>
        </button>
        <span className="got-it-hint">or press Space</span>
      </div>

      <section className="cards-container" aria-label="Your four cards">
        {cards.map((number, index) => {
          const suits = ['♠', '♥', '♦', '♣']
          const suit = suits[index % suits.length]
          const isRed = suit === '♥' || suit === '♦'

          return (
            <div
              className="playing-card"
              key={index}
              onClick={() => handleCardClick(number)}
            >
              <span className="card-corner">{number}</span>

              <span className="card-number">{number}</span>

              <span className={`card-suit ${isRed ? 'red-suit' : ''}`}>
                {suit}
              </span>
            </div>
          )
        })}
      </section>

      <div className="operator-buttons" aria-label="Math operators">
        {['+', '−', '×', '÷', '(', ')'].map((operator) => (
          <button
            key={operator}
            type="button"
            className="operator-button"
            disabled={isRequestPending || !gameId}

            onClick={() => {
              setExpression((current) => {
                const trimmed = current.trimEnd()

                if (!trimmed) {
                  return operator === '(' ? '( ' : ''
                }

                // Add one space before the operator.
                return `${trimmed} ${operator} `
              })

              resetFeedback()
              expressionInputRef.current?.focus()
            }}

          >
            {operator}
          </button>
        ))}

        <button
          type="button"
          className="operator-button"
          disabled={isRequestPending || !gameId}
          onClick={() => {
            setExpression((current) => {
              // Remove trailing spaces first, then remove the last character.
              const trimmed = current.trimEnd()

              if (!trimmed) {
                return ''
              }

              // Remove the last number and the spaces immediately before it.
              const withoutLastNumber = trimmed.replace(/\d+$/, '')
              if (withoutLastNumber !== trimmed) {
                return withoutLastNumber.trimEnd()
              }

              // If the last character isn't a number, remove just that character.
              return trimmed.slice(0, -1).trimEnd()

            })

            resetFeedback()
            expressionInputRef.current?.focus()
          }}

        >
          ⌫
        </button>

        <button
          type="button"
          className="operator-button clear-button"
          disabled={isRequestPending || !gameId}
          onClick={() => {
            setExpression('')
            resetFeedback()
          }}
        >
          Clear
        </button>
      </div>

      <section className="answer-section">
        <div className="expression-header">
          <label htmlFor="expression">Your expression:</label>
          <button
            type="button"
            className="sound-toggle"
            onClick={() => setIsSoundEnabled((enabled) => !enabled)}
            aria-pressed={isSoundEnabled}
            aria-label={`Turn success sound ${isSoundEnabled ? 'off' : 'on'}`}
          >
            Sound: {isSoundEnabled ? 'On 🔊' : 'Off 🔇'}
          </button>
        </div>


        <input
          id="expression"
          ref={expressionInputRef}
          type="text"
          disabled={isRequestPending || !gameId}
          value={expression}
          onChange={(event) => {
            const normalizedValue = event.target.value
              .replace(/[xX*]/g, '×')
              .replace(/\//g, '÷')

            setExpression(normalizedValue)
            resetFeedback()
          }}
          onKeyDown={handleExpressionKeyDown}
          placeholder={`e.g. ${exampleExpression}`}
        />

        <div className="button-container">
          <button type="button" onClick={handleCheckAnswer} disabled={isRequestPending || !gameId} aria-keyshortcuts="C">
            <u>C</u>heck Answer
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={showSolution}
            disabled={isRequestPending || !gameId}
            aria-keyshortcuts="S"
          >
            <u>S</u>how Solutions
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={newGame}
            disabled={isRequestPending}
            aria-keyshortcuts="N"
          >
            <u>N</u>ew Game
          </button>
        </div>

        <p
          className={`game-message ${isCorrect === true
            ? 'correct'
            : isCorrect === false
              ? 'incorrect'
              : ''
            }`}
          role="status"
        >
          {message}
        </p>

        {solutions.length > 0 && (
          <section className="solutions-panel" aria-label="Game solutions">
            <h2>Solutions</h2>
            <ol className="solutions-list">
              {solutions.map((solution) => (
                <li key={solution}>
                  <code>{solution.slice(1, -1)} = 24</code>
                </li>
              ))}
            </ol>
          </section>
        )}

      </section>


      <section className="history-section" aria-label="Game history">
        <div className="history-header">
          <h2>Game History</h2>
          <button
            type="button"
            className="secondary-button"
            onClick={loadGameHistory}
            disabled={isHistoryLoading}
          >
            {isHistoryLoading ? 'Loading...' : 'Refresh History'}
          </button>
        </div>

        {historyError && (
          <p className="history-error" role="alert">
            {historyError}
          </p>
        )}

        {!historyError && !isHistoryLoading && games.length === 0 && (
          <p>No saved games yet. Select Refresh History to load your games.</p>
        )}

        {games.length > 0 && (
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th scope="col">Numbers</th>
                  <th scope="col">Status</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Started</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game.id}>
                    <td>{game.numbers.join(', ')}</td>
                    <td>
                      <span
                        className={`history-status ${game.status.toLowerCase().replace('_', '-')}`}
                      >
                        {game.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>{game.attemptCount}</td>
                    <td>
                      {new Date(game.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </main>
  )
}

export default App
