import { useEffect, useRef, useState } from 'react'

import { formatTime } from './utils/formatTime'
import { playSuccessSound } from './utils/playSuccessSound'
import { checkAnswer } from './game/gameLogic'
import { findAllSolutions } from './game/gameSolver'
import { getRandomExample } from './game/exampleGenerator'
import { generateSolvableCards } from './game/cardGenerator'
import './App.css'

const DEFAULT_MESSAGE = 'Use all four numbers to make 24.'

function App() {
  const [cards, setCards] = useState<number[]>(() =>
    generateSolvableCards() ?? [3, 4, 6, 8],
  )
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

  useEffect(() => {
    if (isTimerRunning) {
      gotItButtonRef.current?.focus()
    }
  }, [isTimerRunning, cards])

  useEffect(() => {
    if (!isTimerRunning) {
      return
    }

    const intervalId = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1)
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isTimerRunning])

  function resetFeedback() {
    setMessage(DEFAULT_MESSAGE)
    setIsCorrect(null)
  }

  function handleCardClick(number: number) {
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
    setIsTimerRunning(false)
    setHasGotIt(true)
    setMessage('Now type your answer and press Check Answer.')
    setIsCorrect(null)
    expressionInputRef.current?.focus()
  }

  function newGame() {
    const newCards = generateSolvableCards()

    if (newCards === null) {
      setMessage('Unable to generate a solvable game. Please try again.')
      setIsCorrect(null)
      return
    }

    setCards(newCards)
    setElapsedSeconds(0)
    setIsTimerRunning(true)
    setHasGotIt(false)
    setExampleExpression(getRandomExample(newCards))
    setSolutions([])
    setExpression('')
    resetFeedback()
  }

  function showSolution() {
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

  function handleCheckAnswer() {
    const normalizedExpression = expression.replace(/[xX*]/g, '×')

    setExpression(normalizedExpression)

    const result = checkAnswer(
      normalizedExpression.replace(/−/g, '-').replace(/×/g, '*').replace(/÷/g, '/'),
      cards,
    )

    if (result.valid) {
      setIsTimerRunning(false)

      // Play the sound only when the answer changes from not-correct to correct.
      if (isSoundEnabled && isCorrect !== true) {
        playSuccessSound()
      }
    }

    setMessage(result.message)
    setIsCorrect(result.valid)
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
      if (!event.altKey || event.ctrlKey || event.metaKey || event.repeat) {
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
          disabled={!isTimerRunning}
        >
          Got it!
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
          <button type="button" onClick={handleCheckAnswer} aria-keyshortcuts="Alt+C">
            <u>C</u>heck Answer
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={showSolution}
            aria-keyshortcuts="Alt+S"
          >
            <u>S</u>how Solutions
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={newGame}
            aria-keyshortcuts="Alt+N"
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

      <footer className="game-footer">
        <p>Use each card exactly once. You may use +, −, ×, ÷, and parentheses.</p>
      </footer>
    </main>
  )
}

export default App
