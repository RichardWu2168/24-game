import type { GameHistoryItem, GameStatus } from '../game.types'
import { formatDuration } from '../../../utils/formatTime'

const STATUS_LABELS: Record<GameStatus, string> = {
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  ABANDONED: 'Abandoned',
}

interface Props {
  games: GameHistoryItem[]
  isLoading: boolean
  error: string
  onRefresh: () => Promise<void>
  onClear: () => Promise<void>
  isClearing: boolean
  disabled: boolean
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => Promise<void>
}

export function GameHistory({ games, isLoading, error, onRefresh, onClear, isClearing, disabled, hasMore, isLoadingMore, onLoadMore }: Props) {
  const busy = isLoading || isLoadingMore || isClearing || disabled
  return <section className="history-section" aria-label="Game history">
    <div className="history-header">
      <h2>Game History</h2>
      <div className="history-actions">
        <button type="button" className="history-button history-button-refresh" onClick={() => void onRefresh()} disabled={busy} aria-busy={isLoading}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M20 7v5h-5M4 17v-5h5" />
            <path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" />
          </svg>
          {isLoading ? 'Loading...' : 'Refresh History'}
        </button>
        <button type="button" className="history-button history-button-clear" onClick={() => void onClear()} disabled={busy} aria-busy={isClearing} title="Clear completed and abandoned games">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
          </svg>
          {isClearing ? 'Clearing...' : 'Clear History'}
        </button>
      </div>
    </div>
    {error && <p className="history-error" role="alert">{error}</p>}
    {!error && !isLoading && games.length === 0 && <p>No saved games yet. Select Refresh History to load your games.</p>}
    {games.length > 0 && <div className="history-table-container">
      <table className="history-table">
        <thead><tr><th scope="col">Numbers</th><th scope="col">Status</th><th scope="col">Attempts</th><th scope="col">Duration</th><th scope="col">Started</th></tr></thead>
        <tbody>{games.map(game => <tr key={game.id}>
          <td>{game.numbers.join(', ')}</td>
          <td><span className={`history-status ${game.status.toLowerCase().replace('_', '-')}`}>{STATUS_LABELS[game.status]}</span></td>
          <td>{game.attemptCount}</td>
          <td>{formatDuration(game.status === 'COMPLETED' ? game.durationSeconds : null)}</td>
          <td>{new Date(game.createdAt).toLocaleString()}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {hasMore && <div className="history-pagination">
      <button type="button" className="history-button history-button-refresh" onClick={() => void onLoadMore()} disabled={busy} aria-busy={isLoadingMore}>
        {isLoadingMore ? 'Loading More...' : 'Load More'}
      </button>
    </div>}
  </section>
}
