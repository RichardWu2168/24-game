import { useGame } from './hooks/useGame'
import { useGameHistory } from './hooks/useGameHistory'
import { useGameShortcuts } from './hooks/useGameShortcuts'
import { GameTimer } from './components/GameTimer'
import { PuzzleCards } from './components/PuzzleCards'
import { OperatorButtons } from './components/OperatorButtons'
import { ExpressionEditor } from './components/ExpressionEditor'
import { GameControls } from './components/GameControls'
import { SolutionsPanel } from './components/SolutionsPanel'
import { GameHistory } from './components/GameHistory'
import './game.css'

export function GamePage() {
  const history = useGameHistory()
  const game = useGame(history.refresh)
  const { state } = game
  const disabled = game.isRequestPending || !state.gameId
  useGameShortcuts({
    checkAnswer: game.checkAnswer, showSolutions: game.showSolutions,
    newGame: game.newGame, gotIt: game.gotIt, isTimerRunning: state.isTimerRunning,
  })

  return <main className="game-container">
    <header className="game-header">
      <h1>Math 24 Game</h1>
      <p>Use four numbers and mathematical operations to make 24!</p>
    </header>
    <GameTimer elapsedSeconds={game.elapsedSeconds} hasGotIt={state.hasGotIt} disabled={disabled || !state.isTimerRunning} buttonRef={game.gotItRef} onGotIt={game.gotIt} />
    <PuzzleCards cards={state.cards} onCardClick={game.insertCard} />
    <OperatorButtons disabled={disabled} onOperator={game.insertOperator} onBackspace={game.backspace} onClear={game.clearExpression} />
    <section className="answer-section">
      <ExpressionEditor expression={state.expression} exampleExpression={state.exampleExpression}
        isSoundEnabled={state.isSoundEnabled} disabled={disabled} inputRef={game.inputRef}
        onChange={game.changeExpression} onSubmit={game.checkAnswer} onToggleSound={game.toggleSound} />
      <GameControls disabled={disabled} newGameDisabled={game.isRequestPending} onCheck={game.checkAnswer} onShowSolutions={game.showSolutions} onNewGame={game.newGame} />
      <p className={`game-message ${state.isCorrect === true ? 'correct' : state.isCorrect === false ? 'incorrect' : ''}`} role="status">{state.message}</p>
      <SolutionsPanel solutions={state.solutions} />
    </section>
    <GameHistory games={history.games} isLoading={history.isLoading} error={history.error} onRefresh={history.refresh} />
  </main>
}
