import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { GameApi } from '../../core/game-api';
import { GAME_BROWSER, GameBrowserPort, GameTabLease } from '../../core/game-browser';
import {
  AnswerView,
  CREDENTIAL_KEY,
  GameJournal,
  JOURNAL_KEY,
  PendingCommand,
  RoundView,
  SessionView,
  StatisticsView,
  THINKING_CAP_MS,
} from '../../core/game.models';
import { GameStore } from './game.store';

const ROUND_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const CREDENTIAL = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function freshRound(overrides: Partial<RoundView> = {}): RoundView {
  return {
    roundId: ROUND_ID,
    sessionId: SESSION_ID,
    cards: [3, 1, 7, 1],
    outcome: 'ACTIVE',
    timingStatus: 'NOT_CAPTURED',
    thinkingTimeMs: null,
    revision: 0,
    attemptCount: 0,
    acceptedExpression: null,
    assisted: false,
    revealedSolution: null,
    createdAt: '2026-11-26T12:00:00Z',
    completedAt: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class MemoryBrowser implements GameBrowserPort {
  time = 1_000_000;
  shown = true;
  blocked = false;
  locked = false;
  sequence = 0;
  values = new Map<string, string>();
  ticks = new Set<() => void>();
  activities = new Set<() => void>();
  storageListeners = new Set<(key: string | null) => void>();

  now = () => this.time;
  read = (key: string) => this.values.get(key) ?? null;
  write = (key: string, value: string) => {
    if (this.blocked) throw new DOMException('Storage unavailable', 'QuotaExceededError');
    this.values.set(key, value);
  };
  remove = (key: string) => {
    if (this.blocked) throw new DOMException('Storage unavailable', 'QuotaExceededError');
    this.values.delete(key);
  };
  randomBytes = (size: number) => Uint8Array.from({ length: size }, (_, index) => index + 1);
  randomUUID = () => `00000000-0000-4000-8000-${String(++this.sequence).padStart(12, '0')}`;
  visible = () => this.shown;
  every = (callback: () => void) => {
    this.ticks.add(callback);
    return () => {
      this.ticks.delete(callback);
    };
  };
  onActivity = (callback: () => void) => {
    this.activities.add(callback);
    return () => {
      this.activities.delete(callback);
    };
  };
  onStorage = (callback: (key: string | null) => void) => {
    this.storageListeners.add(callback);
    return () => {
      this.storageListeners.delete(callback);
    };
  };
  acquireLock = async (): Promise<GameTabLease | null> => {
    if (this.locked) return null;
    this.locked = true;
    let owned = true;
    return {
      isOwner: () => owned && this.locked,
      release: () => {
        if (owned) this.locked = false;
        owned = false;
      },
    };
  };
  elapse(milliseconds: number, tick = true) {
    this.time += milliseconds;
    if (tick) for (const callback of [...this.ticks]) callback();
  }
  activity() {
    for (const callback of [...this.activities]) callback();
  }
  journal(): GameJournal | null {
    const text = this.read(JOURNAL_KEY);
    return text ? (JSON.parse(text) as GameJournal) : null;
  }
}

const emptyStatistics: StatisticsView = {
  totalRounds: 0,
  activeRounds: 0,
  solvedRounds: 0,
  revealedRounds: 0,
  skippedRounds: 0,
  timedSolvedRounds: 0,
  cappedSolvedRounds: 0,
  averageThinkingTimeMs: null,
};

/** Flush promise-only fake API work, without depending on real timer delays. */
async function settled() {
  for (let count = 0; count < 20; count++) await Promise.resolve();
}

describe('GameStore gameplay and recovery', () => {
  let browser: MemoryBrowser;
  let serverRound: RoundView | null;
  let receipts: Map<string, RoundView | AnswerView>;
  let api: {
    initializeSession: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
    getRound: ReturnType<typeof vi.fn>;
    getStatistics: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
  };
  let store: GameStore;
  let stores: GameStore[];

  function session(): SessionView {
    return {
      sessionId: SESSION_ID,
      createdAt: '2026-11-26T12:00:00Z',
      activeRound: serverRound?.outcome === 'ACTIVE' ? structuredClone(serverRound) : null,
    };
  }

  function execute(_credential: string, command: PendingCommand): RoundView | AnswerView {
    const receipt = receipts.get(command.operationId);
    if (receipt) return structuredClone(receipt);
    if (command.kind === 'CREATE') {
      serverRound = freshRound();
    } else if (command.kind === 'TIMING') {
      serverRound = {
        ...serverRound!,
        revision: serverRound!.revision + 1,
        timingStatus: command.thinkingTimeMs === THINKING_CAP_MS ? 'CAPPED' : 'CAPTURED',
        thinkingTimeMs: command.thinkingTimeMs,
      };
    } else if (command.kind === 'ANSWER') {
      const correct = command.expression === '3+1*7-1';
      serverRound = {
        ...serverRound!,
        revision: serverRound!.revision + 1,
        attemptCount: serverRound!.attemptCount + 1,
        outcome: correct ? 'SOLVED' : 'ACTIVE',
        acceptedExpression: correct ? '(3+1)*(7-1)' : null,
        assisted: correct,
        completedAt: correct ? '2026-11-26T12:00:30Z' : null,
      };
      const result: AnswerView = {
        round: structuredClone(serverRound),
        attempt: {
          attemptId: command.operationId,
          operationId: command.operationId,
          roundId: ROUND_ID,
          attemptNumber: serverRound.attemptCount,
          submittedExpression: command.expression,
          status: correct ? 'CORRECT' : 'NOT_TWENTY_FOUR',
          interpretedExpression: correct ? '(3+1)*(7-1)' : command.expression,
          value: correct ? 24 : 12,
          assisted: correct,
          message: correct ? 'Correct!' : 'That expression does not make 24.',
          submittedAt: '2026-11-26T12:00:30Z',
        },
      };
      receipts.set(command.operationId, structuredClone(result));
      return result;
    } else {
      serverRound = {
        ...serverRound!,
        revision: serverRound!.revision + 1,
        outcome: command.kind === 'REVEAL' ? 'REVEALED' : 'SKIPPED',
        revealedSolution: command.kind === 'REVEAL' ? '(3+1)*(7-1)' : null,
        completedAt: '2026-11-26T12:00:30Z',
      };
    }
    receipts.set(command.operationId, structuredClone(serverRound!));
    return structuredClone(serverRound!);
  }

  function createStore() {
    const result = TestBed.runInInjectionContext(() => new GameStore());
    stores.push(result);
    return result;
  }

  beforeEach(() => {
    browser = new MemoryBrowser();
    serverRound = null;
    receipts = new Map();
    stores = [];
    api = {
      initializeSession: vi.fn(async () => session()),
      getSession: vi.fn(async () => session()),
      getRound: vi.fn(async () => structuredClone(serverRound)),
      getStatistics: vi.fn(async () => structuredClone(emptyStatistics)),
      execute: vi.fn(async (credential: string, command: PendingCommand) =>
        execute(credential, command),
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: GameApi, useValue: api },
        { provide: GAME_BROWSER, useValue: browser },
      ],
    });
    store = createStore();
  });

  afterEach(() => {
    for (const instance of stores) instance.dispose();
  });

  async function startVisibleRound() {
    await store.initialize();
    await store.startRound();
    store.markRoundVisible(ROUND_ID);
    await settled();
  }

  async function capture(milliseconds = 12_345) {
    await startVisibleRound();
    browser.elapse(milliseconds, false);
    await store.captureThinkingTime();
  }

  it('persists a canonical random credential before initializing and waits for Start puzzle', async () => {
    api.initializeSession.mockImplementation(async (credential: string) => {
      expect(browser.read(CREDENTIAL_KEY)).toBe(credential);
      expect(credential).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(atob(credential.replaceAll('-', '+').replaceAll('_', '/') + '=').length).toBe(32);
      return session();
    });
    await store.initialize();
    expect(api.initializeSession).toHaveBeenCalledTimes(1);
    expect(api.execute).not.toHaveBeenCalled();
    expect(store.canStart()).toBe(true);
  });

  it('shares an in-flight initialization instead of creating a second editor or request', async () => {
    const response = deferred<SessionView>();
    api.initializeSession.mockReturnValueOnce(response.promise);
    const first = store.initialize();
    const second = store.initialize();
    await settled();
    expect(api.initializeSession).toHaveBeenCalledTimes(1);
    expect(store.otherTab()).toBe(false);
    response.resolve(session());
    await Promise.all([first, second]);
    expect(store.canStart()).toBe(true);
  });

  it('reuses the saved credential after initialization fails', async () => {
    api.initializeSession.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await store.initialize();
    const credential = browser.read(CREDENTIAL_KEY);
    expect(store.error()).toBeTruthy();
    await store.retry();
    expect(api.initializeSession.mock.calls.map((call) => call[0])).toEqual([
      credential,
      credential,
    ]);
    expect(browser.read(CREDENTIAL_KEY)).toBe(credential);
    expect(store.canStart()).toBe(true);
  });

  it('excludes loading and initially hidden time until the rendered cards become visible', async () => {
    const loading = deferred<SessionView>();
    serverRound = freshRound();
    api.initializeSession.mockReturnValueOnce(loading.promise);
    const initialization = store.initialize();
    await settled();
    browser.elapse(20_000);
    loading.resolve(session());
    await initialization;
    browser.elapse(5_000);
    expect(store.elapsedMs()).toBe(0);
    browser.shown = false;
    store.markRoundVisible(ROUND_ID);
    browser.elapse(10_000);
    expect(store.elapsedMs()).toBe(0);
    browser.shown = true;
    browser.activity();
    browser.elapse(1_500);
    expect(store.elapsedMs()).toBe(1_500);
  });

  it('ignores render notifications for a different round', async () => {
    serverRound = freshRound();
    await store.initialize();
    store.markRoundVisible('99999999-9999-4999-8999-999999999999');
    browser.elapse(10_000);
    expect(store.elapsedMs()).toBe(0);
    store.markRoundVisible(ROUND_ID);
    browser.elapse(400);
    expect(store.elapsedMs()).toBe(400);
  });

  it('counts time away and refresh downtime from the original browser start', async () => {
    await startVisibleRound();
    browser.elapse(2_500);
    browser.shown = false;
    browser.elapse(9_000, false);
    browser.activity();
    expect(store.elapsedMs()).toBe(11_500);
    store.dispose();
    browser.elapse(3_000, false);
    store = createStore();
    await store.initialize();
    store.markRoundVisible(ROUND_ID);
    expect(store.elapsedMs()).toBe(14_500);
    browser.shown = true;
    browser.activity();
    browser.elapse(500);
    expect(store.elapsedMs()).toBe(15_000);
  });

  it('freezes the exact click time and durably records it before waiting for the API', async () => {
    await startVisibleRound();
    const response = deferred<RoundView | AnswerView>();
    api.execute.mockImplementationOnce((credential: string, command: PendingCommand) => {
      expect(store.capturedMs()).toBe(12_345);
      expect(browser.journal()?.capturedMs).toBe(12_345);
      expect(browser.journal()?.pending).toEqual(command);
      return response.promise;
    });
    browser.elapse(12_345, false);
    const saving = store.captureThinkingTime();
    expect(store.capturedMs()).toBe(12_345);
    expect(store.elapsedMs()).toBe(12_345);
    expect(store.canEditAnswer()).toBe(true);
    browser.elapse(5_000);
    expect(store.elapsedMs()).toBe(12_345);
    await settled();
    const command = api.execute.mock.calls.at(-1)![1] as PendingCommand;
    response.resolve(execute(CREDENTIAL, command));
    await saving;
  });

  it('retains frozen time and typed text after a wrong answer, then reuses that time for correction', async () => {
    await capture();
    store.setDraft(' 3+1+7+1 ');
    await store.submitAnswer();
    expect(store.round()?.outcome).toBe('ACTIVE');
    expect(store.lastAnswer()?.status).toBe('NOT_TWENTY_FOUR');
    expect(store.draft()).toBe(' 3+1+7+1 ');
    expect(store.capturedMs()).toBe(12_345);
    browser.elapse(50_000);
    store.setDraft('3+1*7-1');
    await store.submitAnswer();
    const answers = api.execute.mock.calls
      .map((call) => call[1] as PendingCommand)
      .filter((command) => command.kind === 'ANSWER');
    expect(answers.map((command) => command.thinkingTimeMs)).toEqual([12_345, 12_345]);
    expect(store.round()?.outcome).toBe('SOLVED');
    expect(store.round()?.acceptedExpression).toBe('(3+1)*(7-1)');
  });

  it('captures the thirty-minute cap once while leaving the puzzle answerable', async () => {
    await startVisibleRound();
    browser.elapse(THINKING_CAP_MS + 45_000);
    await settled();
    browser.elapse(90_000);
    await settled();
    const timings = api.execute.mock.calls
      .map((call) => call[1] as PendingCommand)
      .filter((command) => command.kind === 'TIMING');
    expect(timings).toHaveLength(1);
    expect(timings[0].thinkingTimeMs).toBe(THINKING_CAP_MS);
    expect(store.isCapped()).toBe(true);
    expect(store.round()?.outcome).toBe('ACTIVE');
    expect(store.canEditAnswer()).toBe(true);
    expect(store.elapsedMs()).toBe(THINKING_CAP_MS);
  });

  it('applies the cap immediately after a long refresh interruption', async () => {
    await startVisibleRound();
    store.dispose();
    browser.elapse(THINKING_CAP_MS + 1, false);
    store = createStore();
    await store.initialize();
    store.markRoundVisible(ROUND_ID);
    await settled();
    expect(store.capturedMs()).toBe(THINKING_CAP_MS);
    expect(store.round()?.timingStatus).toBe('CAPPED');
    expect(store.round()?.outcome).toBe('ACTIVE');
  });

  it('restores the frozen duration and exact answer draft after refresh', async () => {
    await capture(4_321);
    store.setDraft(' 3 + 1 * 7 - 1 ');
    store.dispose();
    browser.elapse(100_000, false);
    store = createStore();
    await store.initialize();
    store.markRoundVisible(ROUND_ID);
    expect(store.capturedMs()).toBe(4_321);
    expect(store.elapsedMs()).toBe(4_321);
    expect(store.draft()).toBe(' 3 + 1 * 7 - 1 ');
  });

  it('retries a lost response with the same saved operation instead of creating another round', async () => {
    await store.initialize();
    api.execute.mockImplementationOnce(async (credential: string, command: PendingCommand) => {
      expect(browser.journal()?.pending).toEqual(command);
      execute(credential, command);
      throw new HttpErrorResponse({ status: 0 });
    });
    await store.startRound();
    const original = api.execute.mock.calls[0][1] as PendingCommand;
    expect(store.pending()).toEqual(original);
    expect(store.canStart()).toBe(false);
    await store.retry();
    expect(api.execute.mock.calls[1][1]).toEqual(original);
    expect(receipts.size).toBe(1);
    expect(store.pending()).toBeNull();
    expect(store.round()?.roundId).toBe(ROUND_ID);
  });

  it('restores the same guest before retrying an unauthorized command with its original payload', async () => {
    await startVisibleRound();
    const credential = browser.read(CREDENTIAL_KEY);
    api.execute.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 401,
        error: { code: 'UNAUTHORIZED' },
      }),
    );
    browser.elapse(5_000, false);
    await store.captureThinkingTime();
    const original = structuredClone(store.pending());
    expect(original).toMatchObject({ kind: 'TIMING', roundId: ROUND_ID, thinkingTimeMs: 5_000 });
    expect(browser.journal()?.pending).toEqual(original);
    expect(store.canSubmit()).toBe(false);
    expect(store.error()).toBeTruthy();
    await store.retry();
    expect(api.initializeSession.mock.calls.map((call) => call[0])).toEqual([
      credential,
      credential,
    ]);
    expect(api.execute.mock.calls.at(-1)![0]).toBe(credential);
    expect(api.execute.mock.calls.at(-1)![1]).toEqual(original);
    expect(api.initializeSession.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      api.execute.mock.invocationCallOrder.at(-1)!,
    );
    expect(browser.read(CREDENTIAL_KEY)).toBe(credential);
    expect(store.pending()).toBeNull();
    expect(store.capturedMs()).toBe(5_000);
    expect(store.round()?.thinkingTimeMs).toBe(5_000);
    expect(store.error()).toBeNull();
  });

  it('replays the original answer after refresh when its response was lost', async () => {
    await capture(9_876);
    store.setDraft('3+1*7-1');
    api.execute.mockImplementationOnce(async (credential: string, command: PendingCommand) => {
      execute(credential, command);
      throw new HttpErrorResponse({ status: 503 });
    });
    await store.submitAnswer();
    const original = structuredClone(store.pending());
    expect(original).toMatchObject({
      kind: 'ANSWER',
      expression: '3+1*7-1',
      thinkingTimeMs: 9_876,
    });
    expect(store.canEditAnswer()).toBe(false);
    store.dispose();
    store = createStore();
    await store.initialize();
    expect(api.execute.mock.calls.at(-1)![1]).toEqual(original);
    expect(store.round()?.outcome).toBe('SOLVED');
    expect(store.round()?.attemptCount).toBe(1);
    expect(store.pending()).toBeNull();
    expect(store.draft()).toBe('3+1*7-1');
  });

  it('reconciles a replayed ACTIVE creation receipt against the fresh completed round', async () => {
    const command: PendingCommand = { kind: 'CREATE', operationId: browser.randomUUID() };
    receipts.set(command.operationId, freshRound());
    serverRound = freshRound({
      revision: 4,
      outcome: 'SOLVED',
      timingStatus: 'CAPTURED',
      thinkingTimeMs: 8_000,
      acceptedExpression: '(3+1)*(7-1)',
      assisted: true,
      attemptCount: 1,
      completedAt: '2026-11-26T12:00:30Z',
    });
    browser.write(CREDENTIAL_KEY, CREDENTIAL);
    browser.write(
      JOURNAL_KEY,
      JSON.stringify({
        version: 1,
        owner: CREDENTIAL,
        round: null,
        startedAt: null,
        capturedMs: null,
        draft: '',
        lastAnswer: null,
        pending: command,
      } satisfies GameJournal),
    );
    await store.initialize();
    expect(api.getRound).toHaveBeenCalledWith(CREDENTIAL, ROUND_ID);
    expect(store.round()?.outcome).toBe('SOLVED');
    expect(store.round()?.revision).toBe(4);
    expect(store.capturedMs()).toBe(8_000);
    expect(store.canStart()).toBe(true);
  });

  it('does not replace a newer round revision with an older timing replay receipt', async () => {
    const command: PendingCommand = {
      kind: 'TIMING',
      roundId: ROUND_ID,
      operationId: browser.randomUUID(),
      thinkingTimeMs: 6_000,
    };
    serverRound = freshRound({
      timingStatus: 'CAPTURED',
      thinkingTimeMs: 6_000,
      revision: 10,
      attemptCount: 3,
    });
    receipts.set(
      command.operationId,
      freshRound({
        timingStatus: 'CAPTURED',
        thinkingTimeMs: 6_000,
        revision: 1,
      }),
    );
    browser.write(CREDENTIAL_KEY, CREDENTIAL);
    browser.write(
      JOURNAL_KEY,
      JSON.stringify({
        version: 1,
        owner: CREDENTIAL,
        round: serverRound,
        startedAt: null,
        capturedMs: 6_000,
        draft: '3+1*7-1',
        lastAnswer: null,
        pending: command,
      } satisfies GameJournal),
    );
    api.getSession.mockImplementation(async () => {
      expect(store.round()?.revision).toBe(10);
      return session();
    });
    await store.initialize();
    expect(store.round()?.revision).toBe(10);
    expect(store.round()?.attemptCount).toBe(3);
    expect(store.draft()).toBe('3+1*7-1');
    expect(store.pending()).toBeNull();
  });

  it('keeps reveal and skip from overtaking an unresolved timing capture', async () => {
    await startVisibleRound();
    const response = deferred<RoundView | AnswerView>();
    api.execute.mockImplementationOnce(() => response.promise);
    browser.elapse(2_000, false);
    const saving = store.captureThinkingTime();
    await store.revealSolution();
    await store.skipRound();
    expect(api.execute.mock.calls.map((call) => (call[1] as PendingCommand).kind)).toEqual([
      'CREATE',
      'TIMING',
    ]);
    expect(store.canFinish()).toBe(false);
    const timing = api.execute.mock.calls.at(-1)![1] as PendingCommand;
    response.resolve(execute(CREDENTIAL, timing));
    await saving;
    await store.revealSolution();
    expect(store.round()?.outcome).toBe('REVEALED');
    expect(store.round()?.thinkingTimeMs).toBe(2_000);
  });

  it('uses the server capture after a definitive timing conflict', async () => {
    await startVisibleRound();
    api.execute.mockImplementationOnce(async () => {
      serverRound = freshRound({ timingStatus: 'CAPTURED', thinkingTimeMs: 400, revision: 1 });
      throw new HttpErrorResponse({ status: 409, error: { code: 'TIMING_ALREADY_CAPTURED' } });
    });
    browser.elapse(800, false);
    await store.captureThinkingTime();
    expect(store.pending()).toBeNull();
    expect(store.capturedMs()).toBe(400);
    expect(store.elapsedMs()).toBe(400);
    expect(store.canEditAnswer()).toBe(true);
  });

  it('resumes the existing active puzzle after a create conflict', async () => {
    await store.initialize();
    api.execute.mockImplementationOnce(async () => {
      serverRound = freshRound();
      throw new HttpErrorResponse({ status: 409, error: { code: 'ACTIVE_ROUND_EXISTS' } });
    });
    await store.startRound();
    expect(store.round()?.roundId).toBe(ROUND_ID);
    expect(store.pending()).toBeNull();
    expect(api.execute).toHaveBeenCalledTimes(1);
    expect(store.canStart()).toBe(false);
  });

  it('explains a denied editing lock or storage fallback before any API initialization', async () => {
    browser.acquireLock = async () => {
      throw new DOMException('Site storage is denied', 'SecurityError');
    };
    await store.initialize();
    expect(api.initializeSession).not.toHaveBeenCalled();
    expect(store.loading()).toBe(false);
    expect(store.storageBlocked()).toBe(true);
    expect(store.error()).toBeTruthy();
    expect(store.canRetry()).toBe(true);
  });

  it('settles an old round request without replacing the new active puzzle or its draft', async () => {
    const oldCommand: PendingCommand = {
      kind: 'TIMING',
      roundId: ROUND_ID,
      operationId: browser.randomUUID(),
      thinkingTimeMs: 500,
    };
    receipts.set(
      oldCommand.operationId,
      freshRound({
        timingStatus: 'CAPTURED',
        thinkingTimeMs: 500,
        revision: 1,
      }),
    );
    const nextRoundId = '44444444-4444-4444-8444-444444444444';
    serverRound = freshRound({
      roundId: nextRoundId,
      cards: [6, 6, 6, 6],
      timingStatus: 'CAPTURED',
      thinkingTimeMs: 6_000,
      revision: 1,
    });
    browser.write(CREDENTIAL_KEY, CREDENTIAL);
    browser.write(
      JOURNAL_KEY,
      JSON.stringify({
        version: 1,
        owner: CREDENTIAL,
        round: freshRound(),
        startedAt: browser.now() - 500,
        capturedMs: 500,
        draft: '3+1*7-1',
        lastAnswer: null,
        pending: oldCommand,
      } satisfies GameJournal),
    );
    api.execute.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await store.initialize();
    expect(store.round()?.roundId).toBe(nextRoundId);
    expect(store.pending()).toEqual(oldCommand);
    store.setDraft('6+6+6+6');
    expect(store.draft()).toBe('6+6+6+6');
    await store.retry();
    expect(api.execute.mock.calls.at(-1)![1]).toEqual(oldCommand);
    expect(store.pending()).toBeNull();
    expect(store.round()?.roundId).toBe(nextRoundId);
    expect(store.capturedMs()).toBe(6_000);
    expect(store.draft()).toBe('6+6+6+6');
    expect(browser.journal()?.draft).toBe('6+6+6+6');
  });

  it('does not initialize a guest when its credential cannot be safely stored', async () => {
    browser.blocked = true;
    await store.initialize();
    expect(api.initializeSession).not.toHaveBeenCalled();
    expect(store.storageBlocked()).toBe(true);
    expect(store.error()).toBeTruthy();
  });

  it('does not send a mutation that cannot be recorded for retry', async () => {
    await store.initialize();
    browser.blocked = true;
    await store.startRound();
    expect(api.execute).not.toHaveBeenCalled();
    expect(store.storageBlocked()).toBe(true);
    expect(store.error()).toBeTruthy();
  });

  it('keeps the exact click capture across a storage failure and later retry', async () => {
    await startVisibleRound();
    browser.blocked = true;
    browser.elapse(1_234, false);
    await store.captureThinkingTime();
    expect(store.capturedMs()).toBe(1_234);
    expect(api.execute).toHaveBeenCalledTimes(1);
    browser.elapse(20_000);
    browser.blocked = false;
    await store.retry();
    expect(store.capturedMs()).toBe(1_234);
    expect(serverRound?.thinkingTimeMs).toBe(1_234);
    expect(store.storageBlocked()).toBe(false);
  });

  it('does not turn successful gameplay into a failure when statistics are unavailable', async () => {
    api.getStatistics.mockRejectedValue(new HttpErrorResponse({ status: 503 }));
    await startVisibleRound();
    expect(store.round()?.outcome).toBe('ACTIVE');
    expect(store.pending()).toBeNull();
    expect(store.error()).toBeNull();
    expect(store.canCapture()).toBe(true);
  });

  it('does not let a late statistics response overwrite newer practice totals', async () => {
    const oldStatistics = deferred<StatisticsView>();
    api.getStatistics
      .mockReturnValueOnce(oldStatistics.promise)
      .mockResolvedValue({ ...emptyStatistics, totalRounds: 1, activeRounds: 1 });
    const initialization = store.initialize();
    await settled();
    expect(store.loading()).toBe(false);
    expect(store.canStart()).toBe(true);
    await store.startRound();
    await settled();
    expect(store.statistics()?.totalRounds).toBe(1);
    oldStatistics.resolve(emptyStatistics);
    await initialization;
    await settled();
    expect(store.statistics()?.totalRounds).toBe(1);
  });

  it('does not let a disposed screen overwrite the journal after a new editor recovers its request', async () => {
    await store.initialize();
    const oldResponse = deferred<RoundView | AnswerView>();
    api.execute.mockImplementationOnce(() => oldResponse.promise);
    const oldCreate = store.startRound();
    await settled();
    store.dispose();
    const next = createStore();
    await next.initialize();
    next.markRoundVisible(ROUND_ID);
    browser.elapse(7_000, false);
    await next.captureThinkingTime();
    next.setDraft('3+1*7-1');
    const recoveredJournal = browser.journal();
    oldResponse.resolve(freshRound());
    await oldCreate;
    expect(browser.journal()).toEqual(recoveredJournal);
    expect(next.capturedMs()).toBe(7_000);
    expect(next.draft()).toBe('3+1*7-1');
  });

  it('blocks a second editing tab until the first releases ownership', async () => {
    await startVisibleRound();
    const second = createStore();
    const commandsBefore = api.execute.mock.calls.length;
    await second.initialize();
    expect(second.otherTab()).toBe(true);
    expect(second.canStart()).toBe(false);
    await second.startRound();
    expect(api.execute).toHaveBeenCalledTimes(commandsBefore);
    store.dispose();
    await second.retry();
    expect(second.otherTab()).toBe(false);
    expect(second.round()?.roundId).toBe(ROUND_ID);
  });

  it('discards malformed round data without replacing a valid guest credential', async () => {
    browser.write(CREDENTIAL_KEY, CREDENTIAL);
    browser.write(JOURNAL_KEY, '{ not valid JSON');
    serverRound = freshRound();
    await store.initialize();
    expect(api.initializeSession).toHaveBeenCalledWith(CREDENTIAL);
    expect(browser.read(CREDENTIAL_KEY)).toBe(CREDENTIAL);
    expect(store.round()?.roundId).toBe(ROUND_ID);
    expect(store.notice()).toBeTruthy();
  });

  it('releases browser listeners, display ticks, and tab ownership on dispose', async () => {
    await startVisibleRound();
    expect(browser.ticks.size).toBeGreaterThan(0);
    store.dispose();
    expect(browser.ticks.size).toBe(0);
    expect(browser.activities.size).toBe(0);
    expect(browser.storageListeners.size).toBe(0);
    expect(browser.locked).toBe(false);
  });
});
