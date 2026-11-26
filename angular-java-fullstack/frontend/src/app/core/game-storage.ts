import {
  AnswerStatus,
  AttemptView,
  GameJournal,
  PendingCommand,
  RoundOutcome,
  RoundView,
  THINKING_CAP_MS,
  TimingStatus,
} from './game.models';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Thirty-two bytes use 43 characters; the final two encoding bits must be zero.
const CREDENTIAL = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

export function encodeCredential(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new Error('Guest access requires exactly 32 random bytes.');
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function validCredential(value: string): boolean {
  return typeof value === 'string' && value.length === 43 && CREDENTIAL.test(value);
}

/** Treat persisted JSON as untrusted input, preserving valid request payloads verbatim. */
export function parseJournal(text: string | null, credential: string): GameJournal | null {
  if (text === null) return null;
  const source = record(JSON.parse(text));
  if (source['version'] !== 1 || source['owner'] !== credential || !validCredential(credential)) {
    throw malformed();
  }
  return {
    version: 1,
    owner: credential,
    round: source['round'] === null ? null : parseRound(source['round']),
    startedAt: nullable(source['startedAt'], nonnegativeInteger),
    capturedMs: nullable(source['capturedMs'], duration),
    draft: expression(source['draft']),
    lastAnswer: source['lastAnswer'] === null ? null : parseAttempt(source['lastAnswer']),
    pending: source['pending'] === null ? null : parsePending(source['pending']),
  };
}

function parseRound(value: unknown): RoundView {
  const source = record(value);
  const cards = source['cards'];
  if (
    !Array.isArray(cards) ||
    cards.length !== 4 ||
    !cards.every((card) => Number.isInteger(card) && card >= 1 && card <= 10)
  ) {
    throw malformed();
  }
  const timingStatus = choice<TimingStatus>(source['timingStatus'], [
    'NOT_CAPTURED',
    'CAPTURED',
    'CAPPED',
  ]);
  const thinkingTimeMs = nullable(source['thinkingTimeMs'], duration);
  if (
    (timingStatus === 'NOT_CAPTURED' && thinkingTimeMs !== null) ||
    (timingStatus === 'CAPTURED' &&
      (thinkingTimeMs === null || thinkingTimeMs >= THINKING_CAP_MS)) ||
    (timingStatus === 'CAPPED' && thinkingTimeMs !== THINKING_CAP_MS)
  ) {
    throw malformed();
  }
  return {
    roundId: uuid(source['roundId']),
    sessionId: uuid(source['sessionId']),
    cards: [...cards],
    outcome: choice<RoundOutcome>(source['outcome'], ['ACTIVE', 'SOLVED', 'REVEALED', 'SKIPPED']),
    timingStatus,
    thinkingTimeMs,
    revision: nonnegativeInteger(source['revision']),
    attemptCount: nonnegativeInteger(source['attemptCount']),
    acceptedExpression: nullable(source['acceptedExpression'], string),
    assisted: boolean(source['assisted']),
    revealedSolution: nullable(source['revealedSolution'], string),
    createdAt: date(source['createdAt']),
    completedAt: nullable(source['completedAt'], date),
  };
}

function parseAttempt(value: unknown): AttemptView {
  const source = record(value);
  const attemptNumber = nonnegativeInteger(source['attemptNumber']);
  if (attemptNumber < 1) throw malformed();
  return {
    attemptId: uuid(source['attemptId']),
    operationId: uuid(source['operationId']),
    roundId: uuid(source['roundId']),
    attemptNumber,
    submittedExpression: expression(source['submittedExpression']),
    status: choice<AnswerStatus>(source['status'], [
      'CORRECT',
      'INVALID_SYNTAX',
      'INVALID_CARD_USAGE',
      'ILLEGAL_OPERATION',
      'NOT_TWENTY_FOUR',
    ]),
    interpretedExpression: nullable(source['interpretedExpression'], string),
    value: nullable(source['value'], nonnegativeInteger),
    assisted: boolean(source['assisted']),
    message: string(source['message']),
    submittedAt: date(source['submittedAt']),
  };
}

function parsePending(value: unknown): PendingCommand {
  const source = record(value);
  const kind = choice<PendingCommand['kind']>(source['kind'], [
    'CREATE',
    'TIMING',
    'ANSWER',
    'REVEAL',
    'SKIP',
  ]);
  const operationId = uuid(source['operationId']);
  if (kind === 'CREATE') return Object.freeze({ kind, operationId });
  const roundId = uuid(source['roundId']);
  if (kind === 'REVEAL' || kind === 'SKIP') {
    return Object.freeze({ kind, operationId, roundId });
  }
  const thinkingTimeMs = duration(source['thinkingTimeMs']);
  if (kind === 'TIMING') return Object.freeze({ kind, operationId, roundId, thinkingTimeMs });
  return Object.freeze({
    kind,
    operationId,
    roundId,
    thinkingTimeMs,
    expression: expression(source['expression']),
  });
}

function malformed(): Error {
  return new Error('The saved game is malformed or belongs to a different guest.');
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw malformed();
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw malformed();
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw malformed();
  return value;
}

function nonnegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw malformed();
  return value;
}

function duration(value: unknown): number {
  const result = nonnegativeInteger(value);
  if (result > THINKING_CAP_MS) throw malformed();
  return result;
}

function expression(value: unknown): string {
  const result = string(value);
  if (result.length > 256) throw malformed();
  return result;
}

function uuid(value: unknown): string {
  const result = string(value);
  if (result.length !== 36 || !UUID.test(result)) throw malformed();
  return result;
}

function date(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) throw malformed();
  return result;
}

function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) throw malformed();
  return value as T;
}

function nullable<T>(value: unknown, parse: (item: unknown) => T): T | null {
  return value === null ? null : parse(value);
}
