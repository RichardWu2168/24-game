import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { AnswerView, PendingCommand, RoundView, SessionView, StatisticsView } from './game.models';

export const GAME_API_BASE_URL = new InjectionToken<string>('GAME_API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

/** Allow a sleeping API/database to wake up, including after a long thinking pause. */
export const GAME_API_TIMEOUT_MS = new InjectionToken<number>('GAME_API_TIMEOUT_MS', {
  providedIn: 'root',
  factory: () => 60_000,
});

/** Credentials are attached only to these explicit game endpoint requests. */
@Injectable({ providedIn: 'root' })
export class GameApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(GAME_API_BASE_URL).replace(/\/$/, '');
  private readonly timeoutMs = inject(GAME_API_TIMEOUT_MS);

  initializeSession(credential: string): Promise<SessionView> {
    return this.request('PUT', '/session', credential);
  }

  getSession(credential: string): Promise<SessionView> {
    return this.request('GET', '/session', credential);
  }

  getRound(credential: string, roundId: string): Promise<RoundView> {
    return this.request('GET', `/rounds/${encodeURIComponent(roundId)}`, credential);
  }

  getStatistics(credential: string): Promise<StatisticsView> {
    return this.request('GET', '/statistics', credential);
  }

  execute(credential: string, command: PendingCommand): Promise<RoundView | AnswerView> {
    if (command.kind === 'CREATE') {
      return this.request('POST', '/rounds', credential, { operationId: command.operationId });
    }
    const path = `/rounds/${encodeURIComponent(command.roundId)}`;
    if (command.kind === 'TIMING') {
      return this.request('PUT', `${path}/timing`, credential, {
        operationId: command.operationId,
        thinkingTimeMs: command.thinkingTimeMs,
      });
    }
    if (command.kind === 'ANSWER') {
      return this.request('POST', `${path}/attempts`, credential, {
        operationId: command.operationId,
        expression: command.expression,
        thinkingTimeMs: command.thinkingTimeMs,
      });
    }
    return this.request(
      'POST',
      `${path}/${command.kind === 'REVEAL' ? 'reveal' : 'skip'}`,
      credential,
      { operationId: command.operationId },
    );
  }

  private request<T>(method: string, path: string, credential: string, body?: unknown): Promise<T> {
    return firstValueFrom(
      this.http
        .request<T>(method, this.base + path, {
          headers: new HttpHeaders({ Authorization: `Bearer ${credential}` }),
          ...(body === undefined ? {} : { body }),
        })
        .pipe(timeout(this.timeoutMs)),
    );
  }
}
