import { useState } from 'react'

import { checkAnswer } from './game/gameLogic'
import { findAllSolutions } from './game/gameSolver'
import { generateSolvableCards } from './game/cardGenerator'
import './App.css'

function App() {
  const [cards, setCards] = useState<number[]>(() =>
   generateSolvableCards() ?? [3, 4, 6, 8],
  )
  const [expression, setExpression] = useState('')
  const [message, setMessage] = useState('Use all four numbers to make 24.')
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [solutions, setSolutions] = useState<string[]>([])

  function newGame() {
    const newCards = generateSolvableCards()

    if (newCards === null) {
      setMessage('Unable to generate a solvable game. Please try again.')
      setIsCorrect(null)
      return
    }

    setCards(newCards)
    setSolutions([])
    setExpression('')
    setMessage('Use all four numbers to make 24.')
    setIsCorrect(null)
  }

  function showSolution() {
    const allSolutions = findAllSolutions(cards)

    setSolutions(allSolutions)
    setIsCorrect(null)

    if (allSolutions.length === 0) {
    setMessage('No solution found for these cards.')
    return
    }

    setMessage(`Found ${allSolutions.length} solution(s).`)
  }

  function handleCheckAnswer() {
    const result = checkAnswer(expression, cards)

    setMessage(result.message)
    setIsCorrect(result.valid)
  }

  return (
    <main className="game-container">
      <header className="game-header">
        <h1>The 24 Game</h1>
        <p>Use four numbers and mathematical operations to make 24!</p>
      </header>

      <section className="cards-container" aria-label="Your four cards">
        {cards.map((number, index) => {
          const suits = ['♠', '♥', '♦', '♣']
          const suit = suits[index % suits.length]
          const isRed = suit === '♥' || suit === '♦'

          return (
            <div className="playing-card" key={index}>
              <span className="card-corner">{number}</span>

              <span className="card-number">{number}</span>

              <span className={`card-suit ${isRed ? 'red-suit' : ''}`}>
                {suit}
              </span>
            </div>
          )
        })}
      </section>

      <section className="answer-section">
        <label htmlFor="expression">Your expression</label>

        <input
          id="expression"
          type="text"
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          placeholder={`e.g. ${cards.join(' + ')}`}
        />

        <div className="button-container">
          <button type="button" onClick={handleCheckAnswer}>
            Check Answer
          </button>

          <button
            type="button"
            className="secondary-button" onClick={showSolution}>
            Show Solution
          </button>

          <button type="button" className="secondary-button" onClick={newGame}>
            New Game
          </button>
        </div>
        <p
          className={`game-message ${
            isCorrect === true
              ? 'correct'
              : isCorrect === false
                ? 'incorrect'
                : ''
          }`}
          role="status"
        >
          {message}
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

        </p>
      </section>

      <footer className="game-footer">
        <p>Use each card exactly once. You may use +, −, ×, ÷, and parentheses.</p>
      </footer>
    </main>
  )
}

export default App
