import { requestJson } from '../../../lib/apiClient'
import type { AnswerInput, AnswerResult, GameHistoryResponse, Puzzle } from '../game.types'

export const gameApi = {
  recordGotIt(gameId: string, durationSeconds: number) {
    return requestJson<{ gotItAt?: string; capturedDurationSeconds: number }>(`/api/games/${encodeURIComponent(gameId)}/got-it`, {
      method: 'POST', body: JSON.stringify({ durationSeconds }),
    })
  },
  clearHistory() {
    return requestJson<{ deletedGames: number }>('/api/games', { method: 'DELETE' })
  },
  loadPuzzle(forceNew = false) {
    return requestJson<Puzzle>('/api/puzzle', { method: forceNew ? 'POST' : 'GET' })
  },
  checkAnswer(input: AnswerInput) {
    return requestJson<AnswerResult>('/api/check-answer', { method: 'POST', body: JSON.stringify(input) })
  },
  loadHistory(cursor?: string) {
    return requestJson<GameHistoryResponse>(cursor ? `/api/games?cursor=${encodeURIComponent(cursor)}` : '/api/games')
  },
}
