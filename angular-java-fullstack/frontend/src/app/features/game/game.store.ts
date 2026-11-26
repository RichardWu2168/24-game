import { computed, inject, Injectable, signal } from '@angular/core';
import { GameApi } from '../../core/game-api';
import { GAME_BROWSER, GameTabLease } from '../../core/game-browser';
import {
  AttemptView,
  CREDENTIAL_KEY,
  GameJournal,
  JOURNAL_KEY,
  PendingCommand,
  RoundView,
  StatisticsView,
  THINKING_CAP_MS,
} from '../../core/game.models';
import { encodeCredential, parseJournal, validCredential } from '../../core/game-storage';

interface GameState {
  round: RoundView | null;
  startedAt: number | null;
  draft: string;
  elapsedMs: number;
  capturedMs: number | null;
  lastAnswer: AttemptView | null;
  statistics: StatisticsView | null;
  pending: PendingCommand | null;
  loading: boolean;
  busy: boolean;
  ready: boolean;
  error: string | null;
  notice: string | null;
  otherTab: boolean;
  storageBlocked: boolean;
}

const emptyGame = (): GameState => ({
  round: null,
  startedAt: null,
  draft: '',
  elapsedMs: 0,
  capturedMs: null,
  lastAnswer: null,
  statistics: null,
  pending: null,
  loading: true,
  busy: false,
  ready: false,
  error: null,
  notice: null,
  otherTab: false,
  storageBlocked: false,
});

/** One editing tab, one durable command, and one browser-owned thinking clock. */
@Injectable({ providedIn: 'root' })
export class GameStore {
  private readonly api = inject(GameApi);
  private readonly browser = inject(GAME_BROWSER);
  private readonly state = signal<GameState>(emptyGame());
  private credential: string | null = null;
  private lease: GameTabLease | null = null;
  private initialization: Promise<void> | null = null;
  private localLoaded = false;
  private disposed = false;
  private epoch = 0;
  private statisticsRequest = 0;
  private renderedRoundId: string | null = null;
  private captureNeedsSync = false;
  private cleanups: (() => void)[] = [];

  readonly round = computed(() => this.state().round);
  readonly loading = computed(() => this.state().loading);
  readonly busy = computed(() => this.state().busy);
  readonly draft = computed(() => this.state().draft);
  readonly elapsedMs = computed(() => this.state().elapsedMs);
  readonly capturedMs = computed(() => this.state().capturedMs);
  readonly isCapped = computed(() => this.capturedMs() === THINKING_CAP_MS);
  readonly lastAnswer = computed(() => this.state().lastAnswer);
  readonly statistics = computed(() => this.state().statistics);
  readonly error = computed(() => this.state().error);
  readonly notice = computed(() => this.state().notice);
  readonly pending = computed(() => this.state().pending);
  readonly otherTab = computed(() => this.state().otherTab);
  readonly storageBlocked = computed(() => this.state().storageBlocked);

  private readonly canMutate = computed(() => {
    const state = this.state();
    return (
      state.ready &&
      !state.loading &&
      !state.busy &&
      !state.pending &&
      !state.otherTab &&
      !state.storageBlocked
    );
  });
  readonly canStart = computed(() => this.canMutate() && this.round()?.outcome !== 'ACTIVE');
  readonly canCapture = computed(
    () =>
      this.canMutate() &&
      this.round()?.outcome === 'ACTIVE' &&
      this.capturedMs() === null &&
      this.state().startedAt !== null,
  );
  readonly canEditAnswer = computed(() => {
    const state = this.state();
    return (
      state.ready &&
      !state.loading &&
      !state.otherTab &&
      !state.storageBlocked &&
      state.round?.outcome === 'ACTIVE' &&
      state.capturedMs !== null &&
      (!state.pending || state.pending.kind === 'TIMING')
    );
  });
  readonly canSubmit = computed(
    () =>
      this.canMutate() &&
      this.canEditAnswer() &&
      this.draft().trim().length > 0 &&
      this.draft().length <= 256 &&
      !this.draft().includes('\0'),
  );
  readonly canFinish = computed(() => this.canMutate() && this.round()?.outcome === 'ACTIVE');
  readonly canRetry = computed(
    () =>
      !this.loading() &&
      !this.busy() &&
      !!(
        this.pending() ||
        this.error() ||
        this.storageBlocked() ||
        this.otherTab() ||
        !this.state().ready
      ),
  );

  initialize(): Promise<void> {
    if (!this.initialization) {
      this.disposed = false;
      this.initialization = this.restore(++this.epoch, false);
    }
    return this.initialization;
  }

  async startRound(): Promise<void> {
    if (!this.canStart() || !this.ownsEditor()) return;
    await this.prepare({ kind: 'CREATE', operationId: this.browser.randomUUID() });
  }

  async captureThinkingTime(): Promise<void> {
    if (!this.canCapture() || !this.ownsEditor()) return;
    const duration = this.durationNow();
    // Freeze synchronously at the click, before storage or HTTP can take time.
    this.patch({ capturedMs: duration, elapsedMs: duration });
    await this.prepare({
      kind: 'TIMING',
      operationId: this.browser.randomUUID(),
      roundId: this.round()!.roundId,
      thinkingTimeMs: duration,
    });
  }

  async submitAnswer(): Promise<void> {
    if (!this.canSubmit() || !this.ownsEditor()) return;
    await this.prepare({
      kind: 'ANSWER',
      operationId: this.browser.randomUUID(),
      roundId: this.round()!.roundId,
      expression: this.draft(),
      thinkingTimeMs: this.capturedMs()!,
    });
  }

  async revealSolution(): Promise<void> {
    await this.finish('REVEAL');
  }

  async skipRound(): Promise<void> {
    await this.finish('SKIP');
  }

  async retry(): Promise<void> {
    if (!this.canRetry()) return;
    if (this.otherTab() || !this.lease?.isOwner()) {
      // Another editor may have changed the journal. Never write our old copy over it.
      await this.restore(++this.epoch, false);
    } else if (this.storageBlocked() || !this.state().ready || !this.pending()) {
      // A failed local write may contain the only copy of the exact click time.
      await this.restore(++this.epoch, true);
    } else {
      await this.sendPending(this.epoch, true);
    }
  }

  setDraft(value: string): void {
    if (!this.canEditAnswer() || !this.ownsEditor() || value === this.draft()) return;
    this.patch({ draft: value });
    this.persist();
  }

  markRoundVisible(roundId: string): void {
    if (this.disposed || roundId !== this.round()?.roundId || this.renderedRoundId === roundId)
      return;
    this.renderedRoundId = roundId;
    this.updateClock();
  }

  dispose(): void {
    this.disposed = true;
    this.epoch++;
    this.statisticsRequest++;
    this.initialization = null;
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.lease?.release();
    this.lease = null;
    this.renderedRoundId = null;
    this.patch({ ready: false, busy: false, loading: false });
  }

  private patch(change: Partial<GameState>): void {
    this.state.update((state) =>
      Object.keys(change).every((key) =>
        Object.is(state[key as keyof GameState], change[key as keyof GameState]),
      )
        ? state
        : { ...state, ...change },
    );
  }

  private async restore(epoch: number, preserveLocal: boolean): Promise<void> {
    this.patch({
      loading: true,
      busy: false,
      ready: false,
      error: null,
      notice: null,
      otherTab: false,
    });
    try {
      if (!this.lease?.isOwner()) {
        this.lease?.release();
        const lease = await this.browser.acquireLock();
        if (this.disposed || epoch !== this.epoch) {
          lease?.release();
          return;
        }
        this.lease = lease;
      }
      if (!this.lease) {
        this.patch({
          otherTab: true,
          notice: 'This game is open in another tab. Close that tab, then choose Retry here.',
        });
        return;
      }
      this.watchBrowser();
      if (!this.loadLocal(preserveLocal) || !this.current(epoch)) return;
      await this.api.initializeSession(this.credential!);
      if (!this.current(epoch)) return;
      if (this.pending()) await this.sendPending(epoch, false);
      if (!this.current(epoch) || this.storageBlocked()) return;
      // A replay is the original receipt, not necessarily the current round.
      await this.reconcile(epoch);
      if (!this.current(epoch)) return;
      this.patch({ ready: true });
      this.refreshStatistics(epoch);
    } catch {
      if (!this.disposed && epoch === this.epoch && !this.lease) {
        this.patch({
          storageBlocked: true,
          error:
            'This browser could not open a safe editing session. Allow site storage, then choose Retry.',
        });
      } else if (this.current(epoch) && !this.storageBlocked()) {
        this.patch({
          error:
            'We could not reconnect to your game. Your saved puzzle and answer are kept. Choose Retry.',
        });
      }
    } finally {
      if (epoch === this.epoch && !this.disposed) {
        this.patch({ loading: false });
        this.updateClock();
      }
    }
  }

  private loadLocal(preserveLocal: boolean): boolean {
    try {
      if (!preserveLocal || !this.credential) {
        const existing = this.browser.read(CREDENTIAL_KEY);
        if (existing !== null && !validCredential(existing)) {
          this.patch({
            storageBlocked: true,
            error:
              'The saved guest access is damaged. Restore this browser’s saved data or clear this site’s data to start a new guest session.',
          });
          return false;
        }
        this.credential = existing ?? encodeCredential(this.browser.randomBytes(32));
      }
      // Save before session initialization, including retries of a failed first write.
      this.browser.write(CREDENTIAL_KEY, this.credential);
      if (!preserveLocal || !this.localLoaded) {
        let journal: GameJournal | null = null;
        const text = this.browser.read(JOURNAL_KEY);
        try {
          journal = parseJournal(text, this.credential);
        } catch {
          this.patch({
            notice:
              'The saved puzzle data could not be read. Your guest access is safe; we will restore your game from the server.',
          });
        }
        this.renderedRoundId = null;
        this.captureNeedsSync = false;
        this.patch({
          round: journal?.round ?? null,
          startedAt: journal?.startedAt ?? null,
          capturedMs: journal?.capturedMs ?? null,
          draft: journal?.draft ?? '',
          lastAnswer: journal?.lastAnswer ?? null,
          pending: journal?.pending ? Object.freeze({ ...journal.pending }) : null,
          elapsedMs: journal?.capturedMs ?? 0,
        });
        this.localLoaded = true;
      }
      return this.persist();
    } catch {
      this.blockStorage();
      return false;
    }
  }

  private persist(): boolean {
    if (!this.credential || !this.ownsEditor()) return false;
    try {
      if (this.browser.read(CREDENTIAL_KEY) !== this.credential) {
        this.loseEditor();
        return false;
      }
      const state = this.state();
      const journal: GameJournal = {
        version: 1,
        owner: this.credential,
        round: state.round,
        startedAt: state.startedAt,
        capturedMs: state.capturedMs,
        draft: state.draft,
        lastAnswer: state.lastAnswer,
        pending: state.pending,
      };
      this.browser.write(JOURNAL_KEY, JSON.stringify(journal));
      this.patch({ storageBlocked: false });
      return true;
    } catch {
      this.blockStorage();
      return false;
    }
  }

  private blockStorage(): void {
    this.patch({
      storageBlocked: true,
      error:
        'This browser could not save your game. Your current answer and frozen time are kept on this page. Allow site storage or free some space, then choose Retry.',
    });
  }

  private async prepare(command: PendingCommand): Promise<void> {
    this.patch({ pending: Object.freeze({ ...command }), error: null });
    if (this.persist()) await this.sendPending(this.epoch, false);
  }

  private async finish(kind: 'REVEAL' | 'SKIP'): Promise<void> {
    if (!this.canFinish() || !this.ownsEditor()) return;
    await this.prepare({
      kind,
      operationId: this.browser.randomUUID(),
      roundId: this.round()!.roundId,
    });
  }

  private async sendPending(epoch: number, reconcileAfter: boolean): Promise<void> {
    const command = this.pending();
    if (!command || !this.current(epoch) || this.storageBlocked()) return;
    const selectedRoundId = this.round()?.roundId ?? null;
    this.patch({ busy: true, error: null });
    try {
      const reply = await this.api.execute(this.credential!, command);
      if (!this.acceptsReply(epoch, command, selectedRoundId)) return;
      const round = 'round' in reply ? reply.round : reply;
      if (command.kind !== 'CREATE' && round.roundId !== command.roundId) {
        throw new Error('Unexpected round response');
      }
      const selected = this.round();
      // A fresh session read may already have selected a newer active puzzle
      // while an older command's response was uncertain. Its receipt is still
      // useful to finish that command, but cannot select its old puzzle again.
      const belongsToSelection =
        !selected ||
        selected.roundId === round.roundId ||
        (command.kind === 'CREATE' && selected.outcome !== 'ACTIVE');
      const accepted = belongsToSelection && this.adoptRound(round);
      if (
        'attempt' in reply &&
        accepted &&
        reply.attempt.roundId === round.roundId &&
        reply.attempt.attemptNumber >= (this.lastAnswer()?.attemptNumber ?? 0)
      ) {
        this.patch({ lastAnswer: reply.attempt });
      }
      this.patch({ pending: null });
      if (!this.persist()) return;
      if (reconcileAfter) {
        this.patch({ ready: false });
        await this.reconcile(epoch);
        if (!this.current(epoch)) return;
        this.patch({ ready: true });
      }
      this.refreshStatistics(epoch);
    } catch (failure: unknown) {
      if (!this.acceptsReply(epoch, command, selectedRoundId, false)) return;
      const { status, code } = problem(failure);
      if (status === 400 || status === 409 || status === 404) {
        this.patch({ pending: null });
        this.captureNeedsSync = false;
        if (!this.persist()) return;
        const conflict =
          code === 'ACTIVE_ROUND_EXISTS' ||
          code === 'ROUND_FINISHED' ||
          code === 'TIMING_ALREADY_CAPTURED' ||
          code === 'ROUND_NOT_FOUND';
        this.patch({
          error: conflict
            ? null
            : code === 'IDEMPOTENCY_CONFLICT'
              ? 'This saved action conflicts with an earlier request. It was not sent as a new action. Check the restored puzzle before trying again.'
              : 'That request could not be accepted. Check your answer and try again.',
        });
        if (conflict) {
          this.patch({
            notice:
              code === 'TIMING_ALREADY_CAPTURED'
                ? 'Your previously saved thinking time has been restored.'
                : 'Your latest puzzle state has been restored.',
          });
        }
        if (!this.loading()) {
          this.patch({ ready: false });
          try {
            await this.reconcile(epoch);
            if (this.current(epoch)) this.patch({ ready: true });
          } catch {
            if (this.current(epoch))
              this.patch({
                error: 'We could not refresh the puzzle state. Choose Retry before continuing.',
              });
          }
        }
      } else if (status === 401) {
        // Re-establish the same guest before replaying; never rotate its access
        // or invent a replacement command when the session cannot be found.
        this.patch({
          ready: false,
          error:
            'Your guest session could not be confirmed. Choose Retry to reconnect with your saved game access.',
        });
      } else {
        // No response (or a server failure) cannot establish whether it committed.
        this.patch({
          error:
            'We could not confirm that action. It is saved with your puzzle. Choose Retry to safely check it again.',
        });
      }
    } finally {
      if (this.current(epoch)) {
        this.patch({ busy: false });
        this.updateClock();
      }
    }
  }

  private acceptsReply(
    epoch: number,
    command: PendingCommand,
    selectedRoundId: string | null,
    requirePending = true,
  ): boolean {
    return (
      this.current(epoch) &&
      (!requirePending || this.pending()?.operationId === command.operationId) &&
      (this.round()?.roundId === selectedRoundId ||
        (selectedRoundId === null && this.round() === null) ||
        (command.kind === 'CREATE' && this.pending() === null))
    );
  }

  private async reconcile(epoch: number): Promise<void> {
    const selectedRoundId = this.round()?.roundId ?? null;
    const session = await this.api.getSession(this.credential!);
    if (!this.current(epoch) || (this.round()?.roundId ?? null) !== selectedRoundId) return;
    if (session.activeRound) {
      this.adoptRound(session.activeRound);
    } else if (selectedRoundId) {
      try {
        const round = await this.api.getRound(this.credential!, selectedRoundId);
        if (!this.current(epoch) || this.round()?.roundId !== selectedRoundId) return;
        this.adoptRound(round);
      } catch (failure: unknown) {
        if (problem(failure).status !== 404) throw failure;
        if (!this.current(epoch)) return;
        this.renderedRoundId = null;
        this.patch({
          round: null,
          startedAt: null,
          capturedMs: null,
          elapsedMs: 0,
          draft: '',
          lastAnswer: null,
        });
      }
    }
    if (this.current(epoch)) this.persist();
  }

  /** Revision ordering only applies within one round; request guards order selection. */
  private adoptRound(round: RoundView): boolean {
    const previous = this.round();
    if (previous?.roundId === round.roundId && previous.revision > round.revision) return false;
    if (previous?.roundId !== round.roundId) {
      this.renderedRoundId = null;
      this.captureNeedsSync = false;
      this.patch({ startedAt: null, capturedMs: null, elapsedMs: 0, draft: '', lastAnswer: null });
    }
    this.patch({ round });
    if (round.thinkingTimeMs !== null) {
      this.captureNeedsSync = false;
      this.patch({ capturedMs: round.thinkingTimeMs, elapsedMs: round.thinkingTimeMs });
    } else if (round.outcome !== 'ACTIVE') {
      this.captureNeedsSync = false;
      this.patch({ capturedMs: null, startedAt: null });
    }
    if (this.lastAnswer() && this.lastAnswer()!.attemptNumber < round.attemptCount) {
      this.patch({ lastAnswer: null });
    }
    return true;
  }

  private refreshStatistics(epoch: number): void {
    const request = ++this.statisticsRequest;
    void this.api
      .getStatistics(this.credential!)
      .then((statistics) => {
        if (this.current(epoch) && request === this.statisticsRequest) this.patch({ statistics });
      })
      .catch(() => {
        if (this.current(epoch) && request === this.statisticsRequest && !this.notice()) {
          this.patch({
            notice: 'Your puzzle is ready. Practice totals are temporarily unavailable.',
          });
        }
      });
  }

  private durationNow(): number {
    const start = this.state().startedAt;
    return start === null
      ? 0
      : Math.min(THINKING_CAP_MS, Math.max(0, Math.floor(this.browser.now() - start)));
  }

  private updateClock(): void {
    if (this.disposed || !this.ownsEditor() || this.round()?.outcome !== 'ACTIVE') return;
    if (this.capturedMs() !== null) {
      if (this.captureNeedsSync && this.canMutate()) this.saveCappedTime();
      return;
    }
    if (this.state().startedAt === null) {
      if (
        !this.canMutate() ||
        !this.browser.visible() ||
        this.renderedRoundId !== this.round()?.roundId
      )
        return;
      this.patch({ startedAt: this.browser.now(), elapsedMs: 0 });
      if (!this.persist()) return;
    }
    const elapsedMs = this.durationNow();
    this.patch({ elapsedMs });
    if (elapsedMs === THINKING_CAP_MS && !this.loading()) {
      this.patch({ capturedMs: THINKING_CAP_MS });
      this.captureNeedsSync = true;
      if (this.canMutate()) this.saveCappedTime();
      else this.persist();
    }
  }

  private saveCappedTime(): void {
    this.captureNeedsSync = false;
    void this.prepare({
      kind: 'TIMING',
      operationId: this.browser.randomUUID(),
      roundId: this.round()!.roundId,
      thinkingTimeMs: THINKING_CAP_MS,
    });
  }

  private watchBrowser(): void {
    if (this.cleanups.length) return;
    this.cleanups.push(this.browser.every(() => this.updateClock(), 100));
    this.cleanups.push(this.browser.onActivity(() => this.updateClock()));
    this.cleanups.push(
      this.browser.onStorage((key) => {
        if (key === null || key === CREDENTIAL_KEY || key === JOURNAL_KEY) this.loseEditor();
        else this.ownsEditor();
      }),
    );
  }

  private current(epoch: number): boolean {
    return !this.disposed && epoch === this.epoch && this.ownsEditor();
  }

  private ownsEditor(): boolean {
    if (this.disposed || !this.lease) return false;
    if (this.lease.isOwner()) return true;
    this.loseEditor();
    return false;
  }

  private loseEditor(): void {
    if (this.disposed || this.otherTab()) return;
    this.epoch++;
    this.lease?.release();
    this.lease = null;
    this.patch({
      ready: false,
      busy: false,
      loading: false,
      otherTab: true,
      error: null,
      notice:
        'Another tab changed this game, or this tab’s editing access expired. Close other game tabs, then choose Retry to restore the latest puzzle.',
    });
  }
}

function problem(failure: unknown): { status: number; code: string } {
  if (!failure || typeof failure !== 'object') return { status: 0, code: '' };
  const value = failure as { status?: unknown; error?: { code?: unknown } };
  return {
    status: typeof value.status === 'number' ? value.status : 0,
    code: typeof value.error?.code === 'string' ? value.error.code : '',
  };
}
