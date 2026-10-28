import { requestJson } from '../../../lib/apiClient'
import type { AnswerInput, AnswerResult, GameHistoryResponse, Puzzle } from '../game.types'

export const gameApi = {
  loadPuzzle(forceNew = false) {
    return requestJson<Puzzle>('/api/puzzle', { method: forceNew ? 'POST' : 'GET' })
  },
  checkAnswer(input: AnswerInput) {
    return requestJson<AnswerResult>('/api/check-answer', { method: 'POST', body: JSON.stringify(input) })
  },
  loadHistory() {
    return requestJson<GameHistoryResponse>('/api/games')
  },
}
