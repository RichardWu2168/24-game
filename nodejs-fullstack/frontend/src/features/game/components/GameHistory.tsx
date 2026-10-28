import type { GameHistoryItem } from '../game.types'

interface Props {
  games: GameHistoryItem[]
  isLoading: boolean
  error: string
  onRefresh: () => Promise<void>
}

export function GameHistory({ games, isLoading, error, onRefresh }: Props) {
  return <section className="history-section" aria-label="Game history">
    <div className="history-header">
      <h2>Game History</h2>
      <button type="button" className="secondary-button" onClick={() => void onRefresh()} disabled={isLoading}>
        {isLoading ? 'Loading...' : 'Refresh History'}
      </button>
    </div>
    {error && <p className="history-error" role="alert">{error}</p>}
    {!error && !isLoading && games.length === 0 && <p>No saved games yet. Select Refresh History to load your games.</p>}
    {games.length > 0 && <div className="history-table-container">
      <table className="history-table">
        <thead><tr><th scope="col">Numbers</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">Started</th></tr></thead>
        <tbody>{games.map(game => <tr key={game.id}>
          <td>{game.numbers.join(', ')}</td>
          <td><span className={`history-status ${game.status.toLowerCase().replace('_', '-')}`}>{game.status.replace('_', ' ')}</span></td>
          <td>{game.attemptCount}</td>
          <td>{new Date(game.createdAt).toLocaleString()}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>
}
