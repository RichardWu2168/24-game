import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { GameStore } from './features/game/game.store';

type Round = NonNullable<ReturnType<GameStore['round']>>;
type Attempt = NonNullable<ReturnType<GameStore['lastAnswer']>>;

function round(overrides: Partial<Round> = {}): Round {
  return {
    roundId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
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

function createStore() {
  const currentRound = signal<Round | null>(null);
  const loading = signal(false);
  const busy = signal(false);
  const draft = signal('');
  const capturedMs = signal<number | null>(null);
  const elapsedMs = signal(0);
  const error = signal<string | null>(null);
  const active = computed(() => currentRound()?.outcome === 'ACTIVE');
  const ready = computed(() => !loading() && !busy());

  return {
    round: currentRound,
    loading,
    busy,
    draft,
    elapsedMs,
    capturedMs,
    isCapped: computed(() => capturedMs() === 1_800_000),
    lastAnswer: signal<Attempt | null>(null),
    statistics: signal<ReturnType<GameStore['statistics']>>(null),
    error,
    notice: signal<string | null>(null),
    pending: signal<ReturnType<GameStore['pending']>>(null),
    otherTab: signal(false),
    storageBlocked: signal(false),
    canStart: computed(() => ready() && !active()),
    canCapture: computed(() => ready() && active() && capturedMs() === null),
    canEditAnswer: computed(() => active() && capturedMs() !== null),
    canSubmit: computed(
      () => ready() && active() && capturedMs() !== null && draft().trim().length > 0,
    ),
    canFinish: computed(() => ready() && active()),
    canRetry: computed(() => ready() && error() !== null),
    initialize: vi.fn(async () => undefined),
    startRound: vi.fn(async () => undefined),
    captureThinkingTime: vi.fn(async () => {
      capturedMs.set(elapsedMs());
    }),
    submitAnswer: vi.fn(async () => undefined),
    revealSolution: vi.fn(async () => undefined),
    skipRound: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    setDraft: vi.fn((value: string) => draft.set(value)),
    markRoundVisible: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('Math 24 gameplay screen', () => {
  let fixture: ComponentFixture<App>;
  let store: ReturnType<typeof createStore>;

  beforeEach(async () => {
    store = createStore();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: GameStore, useValue: store }],
    }).compileComponents();
  });

  async function render() {
    fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function button(label: string): HTMLButtonElement {
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const result = buttons.find((element) => element.textContent?.trim() === label);
    expect(result, `Expected a button labelled "${label}"`).toBeDefined();
    return result!;
  }

  it('initializes the guest and lets the player choose when the first puzzle starts', async () => {
    const page = await render();
    expect(store.initialize).toHaveBeenCalledTimes(1);
    expect(store.startRound).not.toHaveBeenCalled();
    expect(page.textContent).not.toContain('Hello, frontend');
    button('Start puzzle').click();
    expect(store.startRound).toHaveBeenCalledTimes(1);
  });

  it('marks the rendered round visible and keeps the running clock outside live regions', async () => {
    store.round.set(round());
    store.elapsedMs.set(12_300);
    const page = await render();
    expect(store.markRoundVisible).toHaveBeenCalledWith(store.round()!.roundId);
    const liveText = Array.from(page.querySelectorAll('[aria-live], [role="status"]'))
      .map((element) => element.textContent)
      .join(' ');
    expect(liveText).not.toContain('00:12');
    expect(button('Got It!').disabled).toBe(false);
  });

  it('opens and focuses answer entry immediately while the captured time is still being saved', async () => {
    store.round.set(round());
    store.elapsedMs.set(12_345);
    let finishSave!: () => void;
    store.captureThinkingTime.mockImplementation(() => {
      store.capturedMs.set(store.elapsedMs());
      store.busy.set(true);
      return new Promise<void>((resolve) => {
        finishSave = resolve;
      });
    });
    const page = await render();
    button('Got It!').click();
    await fixture.whenStable();
    const input = page.querySelector<HTMLInputElement>('#answer-expression')!;
    expect(input).not.toBeNull();
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(button('Check answer').disabled).toBe(true);
    finishSave();
  });

  it('retains a restored draft without moving keyboard focus into it', async () => {
    store.round.set(round({ timingStatus: 'CAPTURED', thinkingTimeMs: 4_200 }));
    store.capturedMs.set(4_200);
    store.elapsedMs.set(4_200);
    store.draft.set('3 + 1 * 7 - 1');
    const page = await render();
    const input = page.querySelector<HTMLInputElement>('#answer-expression')!;
    expect(input.value).toBe('3 + 1 * 7 - 1');
    expect(input.maxLength).toBe(256);
    expect(document.activeElement).not.toBe(input);
  });

  it('preserves typed text and submits it once through the native answer form', async () => {
    store.round.set(round({ timingStatus: 'CAPTURED', thinkingTimeMs: 8_000 }));
    store.capturedMs.set(8_000);
    const page = await render();
    const input = page.querySelector<HTMLInputElement>('#answer-expression')!;
    input.value = ' 3+1*7-1 ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(store.draft()).toBe(' 3+1*7-1 ');
    const submit = button('Check answer');
    expect(submit.type).toBe('submit');
    submit.click();
    expect(store.submitAnswer).toHaveBeenCalledTimes(1);
  });

  it('inserts a tapped operator at the selection and distinguishes repeated cards', async () => {
    store.round.set(round({ timingStatus: 'CAPTURED', thinkingTimeMs: 8_000 }));
    store.capturedMs.set(8_000);
    store.draft.set('3-1*7-1');
    const page = await render();
    const input = page.querySelector<HTMLInputElement>('#answer-expression')!;
    input.focus();
    input.setSelectionRange(1, 2);
    page.querySelector<HTMLButtonElement>('button[aria-label="Add"]')!.click();
    await fixture.whenStable();
    expect(store.draft()).toBe('3+1*7-1');
    expect(input.selectionStart).toBe(2);
    expect(document.activeElement).toBe(input);
    const labels = Array.from(page.querySelectorAll('button[aria-label^="Card "]')).map((card) =>
      card.getAttribute('aria-label'),
    );
    expect(labels).toHaveLength(4);
    expect(labels[1]).toContain('Card 2: 1');
    expect(labels[3]).toContain('Card 4: 1');
  });

  it('shows the backend accepted grouping and makes assistance clear after a solve', async () => {
    store.round.set(
      round({
        outcome: 'SOLVED',
        timingStatus: 'CAPTURED',
        thinkingTimeMs: 5_678,
        acceptedExpression: '(3+1)*(7-1)',
        assisted: true,
        completedAt: '2026-11-26T12:00:10Z',
      }),
    );
    store.capturedMs.set(5_678);
    store.draft.set('3+1*7-1');
    const page = await render();
    expect(page.textContent).toContain('(3+1)*(7-1)');
    expect(page.textContent?.toLowerCase()).toContain('parentheses');
    expect(page.textContent).not.toMatch(/(?<!\()3\+1\*7-1\s*=\s*24/);
    expect(button('Next puzzle').disabled).toBe(false);
    button('Next puzzle').click();
    expect(store.startRound).toHaveBeenCalledTimes(1);
  });

  it('leaves a capped puzzle available for answering', async () => {
    store.round.set(round({ timingStatus: 'CAPPED', thinkingTimeMs: 1_800_000 }));
    store.capturedMs.set(1_800_000);
    store.elapsedMs.set(1_800_000);
    store.draft.set('3+1*7-1');
    const page = await render();
    expect(page.querySelector<HTMLInputElement>('#answer-expression')?.disabled).toBe(false);
    expect(button('Check answer').disabled).toBe(false);
    expect(page.textContent?.toLowerCase()).toMatch(/limit|capped/);
  });

  it('offers retry without putting technical identifiers into the game', async () => {
    store.round.set(round());
    store.error.set('Could not reach the game. Your puzzle is saved; try again.');
    const page = await render();
    expect(page.textContent).toContain('Your puzzle is saved');
    expect(page.textContent).not.toContain(store.round()!.roundId);
    expect(page.textContent).not.toContain(store.round()!.sessionId);
    button('Retry connection').click();
    expect(store.retry).toHaveBeenCalledTimes(1);
  });

  it('releases the game resources when the screen is removed', async () => {
    await render();
    fixture.destroy();
    expect(store.dispose).toHaveBeenCalledTimes(1);
  });
});
