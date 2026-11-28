import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { GameApi, GAME_API_BASE_URL, GAME_API_TIMEOUT_MS } from './game-api';
import { PendingCommand } from './game.models';

const credential = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const roundId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';

describe('GameApi HTTP boundary', () => {
  let api: GameApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(GameApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('sends the guest credential only in the initialization authorization header', async () => {
    const result = api.initializeSession(credential);
    const request = http.expectOne('/api/v1/session');
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${credential}`);
    expect(request.request.urlWithParams).not.toContain(credential);
    expect(request.request.body).toBeNull();
    expect(request.request.withCredentials).toBe(false);
    const session = { sessionId: 'guest', createdAt: '2026-11-26T12:00:00Z', activeRound: null };
    request.flush(session);
    await expect(result).resolves.toEqual(session);
  });

  const commands: { command: PendingCommand; method: string; path: string; body: unknown }[] = [
    {
      command: { kind: 'CREATE', operationId },
      method: 'POST',
      path: '/rounds',
      body: { operationId },
    },
    {
      command: { kind: 'TIMING', operationId, roundId, thinkingTimeMs: 12345 },
      method: 'PUT',
      path: `/rounds/${roundId}/timing`,
      body: { operationId, thinkingTimeMs: 12345 },
    },
    {
      command: {
        kind: 'ANSWER',
        operationId,
        roundId,
        thinkingTimeMs: 12345,
        expression: ' 3+1*7-1 ',
      },
      method: 'POST',
      path: `/rounds/${roundId}/attempts`,
      body: { operationId, thinkingTimeMs: 12345, expression: ' 3+1*7-1 ' },
    },
    {
      command: { kind: 'REVEAL', operationId, roundId },
      method: 'POST',
      path: `/rounds/${roundId}/reveal`,
      body: { operationId },
    },
    {
      command: { kind: 'SKIP', operationId, roundId },
      method: 'POST',
      path: `/rounds/${roundId}/skip`,
      body: { operationId },
    },
  ];

  it.each(commands)(
    'maps $command.kind to its exact endpoint and immutable payload',
    async ({ command, method, path, body }) => {
      const result = api.execute(credential, command);
      const request = http.expectOne(`/api/v1${path}`);
      expect(request.request.method).toBe(method);
      expect(request.request.body).toEqual(body);
      expect(request.request.headers.get('Authorization')).toBe(`Bearer ${credential}`);
      request.flush({ revision: 2 });
      await expect(result).resolves.toEqual({ revision: 2 });
    },
  );

  it('treats an evaluated wrong answer as a normal result for correction', async () => {
    const result = api.execute(credential, {
      kind: 'ANSWER',
      operationId,
      roundId,
      expression: '3+1+7+1',
      thinkingTimeMs: 7000,
    });
    const response = {
      round: { roundId, outcome: 'ACTIVE', thinkingTimeMs: 7000 },
      attempt: { status: 'NOT_TWENTY_FOUR', submittedExpression: '3+1+7+1', value: 12 },
    };
    http.expectOne(`/api/v1/rounds/${roundId}/attempts`).flush(response);
    await expect(result).resolves.toEqual(response);
  });

  it('preserves structured rejection status for the store to reconcile', async () => {
    const result = api.execute(credential, { kind: 'CREATE', operationId });
    const rejected = expect(result).rejects.toMatchObject({
      status: 409,
      error: { code: 'ACTIVE_ROUND_EXISTS' },
    });
    http
      .expectOne('/api/v1/rounds')
      .flush(
        { code: 'ACTIVE_ROUND_EXISTS', detail: 'An active round already exists.' },
        { status: 409, statusText: 'Conflict' },
      );
    await rejected;
  });

  it('accepts an answer response after the API wakes up without changing the saved command', async () => {
    vi.useFakeTimers();
    const command: PendingCommand = {
      kind: 'ANSWER',
      operationId,
      roundId,
      expression: '3+1*7-1',
      thinkingTimeMs: 1200000,
    };
    const result = api.execute(credential, command);
    const resolved = expect(result).resolves.toEqual({ revision: 2 });
    const request = http.expectOne(`/api/v1/rounds/${roundId}/attempts`);

    await vi.advanceTimersByTimeAsync(15_000);

    expect(request.cancelled).toBe(false);
    expect(request.request.body).toEqual({
      operationId,
      expression: '3+1*7-1',
      thinkingTimeMs: 1200000,
    });
    request.flush({ revision: 2 });
    await resolved;
  });

  it('cancels an unanswered request after a bounded wait without retrying it automatically', async () => {
    vi.useFakeTimers();
    const result = api.getSession(credential);
    const rejected = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    const request = http.expectOne('/api/v1/session');

    await vi.advanceTimersByTimeAsync(59_999);
    expect(request.cancelled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await rejected;
    expect(request.cancelled).toBe(true);
    http.expectNone('/api/v1/session');
  });

  it('uses a configured request timeout', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GAME_API_TIMEOUT_MS, useValue: 5_000 },
      ],
    });
    api = TestBed.inject(GameApi);
    http = TestBed.inject(HttpTestingController);
    vi.useFakeTimers();
    const result = api.getSession(credential);
    const rejected = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    const request = http.expectOne('/api/v1/session');

    await vi.advanceTimersByTimeAsync(5_000);

    await rejected;
    expect(request.cancelled).toBe(true);
  });

  it('does not attach the guest credential to unrelated HttpClient requests', async () => {
    const result = firstValueFrom(TestBed.inject(HttpClient).get('/public-health'));
    const request = http.expectOne('/public-health');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ status: 'UP' });
    await result;
  });

  it('supports a configured API origin without changing endpoint payloads', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GAME_API_BASE_URL, useValue: 'https://api.example.test/api/v1/' },
      ],
    });
    api = TestBed.inject(GameApi);
    http = TestBed.inject(HttpTestingController);
    const result = api.getStatistics(credential);
    http.expectOne('https://api.example.test/api/v1/statistics').flush({ totalRounds: 0 });
    await expect(result).resolves.toEqual({ totalRounds: 0 });
  });
});
