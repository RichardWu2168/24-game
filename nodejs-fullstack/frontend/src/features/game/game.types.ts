export type GameStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED'

export interface Puzzle {
  numbers: number[]
  gameId: string
}

export interface AnswerInput {
  numbers: number[]
  expression: string
  gameId: string
}

export interface AnswerResult {
  valid: boolean
  message: string
  value?: number
}

export interface GameHistoryItem {
  id: string
  numbers: number[]
  status: GameStatus
  createdAt: string
  completedAt: string | null
  attemptCount: number
}

export interface GameHistoryResponse {
  games: GameHistoryItem[]
  nextCursor: string | null
  hasMore: boolean
}
