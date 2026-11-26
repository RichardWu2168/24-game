import { encodeCredential, parseJournal, validCredential } from './game-storage';
import { GameJournal } from './game.models';

const credential = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function savedAnswer(): GameJournal {
  const roundId = '11111111-1111-4111-8111-111111111111';
  return {
    version: 1,
    owner: credential,
    round: {
      roundId,
      sessionId: '22222222-2222-4222-8222-222222222222',
      cards: [3, 1, 7, 1],
      outcome: 'ACTIVE',
      timingStatus: 'CAPTURED',
      thinkingTimeMs: 12_345,
      revision: 1,
      attemptCount: 0,
      acceptedExpression: null,
      assisted: false,
      revealedSolution: null,
      createdAt: '2026-11-26T12:00:00Z',
      completedAt: null,
    },
    startedAt: 1_000_000,
    capturedMs: 12_345,
    draft: ' 3+1*7-1 ',
    lastAnswer: null,
    pending: {
      kind: 'ANSWER',
      roundId,
      operationId: '33333333-3333-4333-8333-333333333333',
      expression: ' 3+1*7-1 ',
      thinkingTimeMs: 12_345,
    },
  };
}

describe('Browser game storage boundary', () => {
  it('encodes all 32 random bytes as canonical unpadded base64url', () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
    const encoded = encodeCredential(bytes);
    expect(encoded).toHaveLength(43);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(validCredential(encoded)).toBe(true);
    const decoded = atob(encoded.replaceAll('-', '+').replaceAll('_', '/') + '=');
    expect(Array.from(decoded, (character) => character.charCodeAt(0))).toEqual(Array.from(bytes));
    expect(validCredential('A'.repeat(42) + 'B')).toBe(false);
    expect(validCredential('A'.repeat(42) + '=')).toBe(false);
    expect(validCredential('A'.repeat(42))).toBe(false);
  });

  it('treats an absent round journal as a fresh browser while retaining the credential', () => {
    expect(parseJournal(null, credential)).toBeNull();
    expect(validCredential(credential)).toBe(true);
  });

  it('restores a frozen pending answer without changing whitespace, operation, or duration', () => {
    const original = savedAnswer();
    const restored = parseJournal(JSON.stringify(original), credential);
    expect(restored).toEqual(original);
    expect(restored?.pending).toEqual(original.pending);
    expect(restored?.draft).toBe(' 3+1*7-1 ');
  });

  it('rejects corrupted or foreign journals instead of replaying them as this guest', () => {
    expect(() => parseJournal('{ broken JSON', credential)).toThrow();
    expect(() =>
      parseJournal(JSON.stringify({ ...savedAnswer(), version: 2 }), credential),
    ).toThrow();
    const foreign = encodeCredential(new Uint8Array(32).fill(255));
    expect(() => parseJournal(JSON.stringify(savedAnswer()), foreign)).toThrow();
  });
});
