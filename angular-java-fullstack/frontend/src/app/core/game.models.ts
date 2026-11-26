export type RoundOutcome = 'ACTIVE' | 'SOLVED' | 'REVEALED' | 'SKIPPED';
export type TimingStatus = 'NOT_CAPTURED' | 'CAPTURED' | 'CAPPED';
export type AnswerStatus =
  'CORRECT' | 'INVALID_SYNTAX' | 'INVALID_CARD_USAGE' | 'ILLEGAL_OPERATION' | 'NOT_TWENTY_FOUR';

export interface RoundView {
  roundId: string;
  sessionId: string;
  cards: number[];
  outcome: RoundOutcome;
  timingStatus: TimingStatus;
  thinkingTimeMs: number | null;
  revision: number;
  attemptCount: number;
  acceptedExpression: string | null;
  assisted: boolean;
  revealedSolution: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SessionView {
  sessionId: string;
  createdAt: string;
  activeRound: RoundView | null;
}

export interface AttemptView {
  attemptId: string;
  operationId: string;
  roundId: string;
  attemptNumber: number;
  submittedExpression: string;
  status: AnswerStatus;
  interpretedExpression: string | null;
  value: number | null;
  assisted: boolean;
  message: string;
  submittedAt: string;
}

export interface AnswerView {
  round: RoundView;
  attempt: AttemptView;
}

export interface StatisticsView {
  totalRounds: number;
  activeRounds: number;
  solvedRounds: number;
  revealedRounds: number;
  skippedRounds: number;
  timedSolvedRounds: number;
  cappedSolvedRounds: number;
  averageThinkingTimeMs: number | null;
}

export type PendingCommand =
  | { kind: 'CREATE'; operationId: string }
  | { kind: 'TIMING'; operationId: string; roundId: string; thinkingTimeMs: number }
  | {
      kind: 'ANSWER';
      operationId: string;
      roundId: string;
      expression: string;
      thinkingTimeMs: number;
    }
  | { kind: 'REVEAL' | 'SKIP'; operationId: string; roundId: string };

export interface GameJournal {
  version: 1;
  owner: string;
  round: RoundView | null;
  startedAt: number | null;
  capturedMs: number | null;
  draft: string;
  lastAnswer: AttemptView | null;
  pending: PendingCommand | null;
}

export const THINKING_CAP_MS = 1_800_000;
export const CREDENTIAL_KEY = 'math24.guestCredential';
export const JOURNAL_KEY = 'math24.game.v1';
