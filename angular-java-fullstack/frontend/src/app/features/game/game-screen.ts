import {
  afterEveryRender,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { GameStore } from './game.store';

@Component({
  selector: 'app-game-screen',
  templateUrl: './game-screen.html',
  styleUrl: './game-screen.scss',
})
export class GameScreen implements OnInit, OnDestroy {
  readonly store = inject(GameStore);
  readonly rulesOpen = signal(false);
  readonly suits = ['♠', '♥', '♣', '♦'];
  readonly placeholderCards = [0, 1, 2, 3];
  readonly operators = [
    { text: '+', value: '+', label: 'Add' },
    { text: '−', value: '-', label: 'Subtract' },
    { text: '×', value: '*', label: 'Multiply' },
    { text: '÷', value: '/', label: 'Divide' },
    { text: '(', value: '(', label: 'Open parenthesis' },
    { text: ')', value: ')', label: 'Close parenthesis' },
  ];

  private readonly expressionInput = viewChild<ElementRef<HTMLInputElement>>('expressionInput');
  private readonly rulesButton = viewChild<ElementRef<HTMLButtonElement>>('rulesButton');
  private focusAnswer = false;
  private caret: number | null = null;

  constructor() {
    afterEveryRender(() => {
      const round = this.store.round();
      if (round && !this.store.loading()) this.store.markRoundVisible(round.roundId);

      const input = this.expressionInput()?.nativeElement;
      if (this.focusAnswer && input && !input.disabled) {
        input.focus();
        if (this.caret !== null) input.setSelectionRange(this.caret, this.caret);
        this.focusAnswer = false;
        this.caret = null;
      }
    });
  }

  ngOnInit(): void {
    void this.store.initialize();
  }

  ngOnDestroy(): void {
    this.store.dispose();
  }

  closeRules(): void {
    this.rulesOpen.set(false);
    this.rulesButton()?.nativeElement.focus();
  }

  captureTime(): void {
    if (!this.store.canCapture()) return;
    this.focusAnswer = true;
    void this.store.captureThinkingTime();
  }

  updateExpression(event: Event): void {
    this.store.setDraft((event.target as HTMLInputElement).value);
  }

  submit(event: Event): void {
    event.preventDefault();
    if (this.store.canSubmit()) void this.store.submitAnswer();
  }

  insert(value: string): void {
    if (!this.store.canEditAnswer()) return;
    const input = this.expressionInput()?.nativeElement;
    const draft = this.store.draft();
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const next = draft.slice(0, start) + value + draft.slice(end);
    if (next.length > 256) return;
    this.focusAnswer = true;
    this.caret = start + value.length;
    this.store.setDraft(next);
  }

  backspace(): void {
    if (!this.store.canEditAnswer()) return;
    const input = this.expressionInput()?.nativeElement;
    const draft = this.store.draft();
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? start;
    const removeFrom = start === end ? Math.max(0, start - 1) : start;
    if (removeFrom === end) return;
    this.focusAnswer = true;
    this.caret = removeFrom;
    this.store.setDraft(draft.slice(0, removeFrom) + draft.slice(end));
  }

  clearExpression(): void {
    if (!this.store.canEditAnswer()) return;
    this.focusAnswer = true;
    this.caret = 0;
    this.store.setDraft('');
  }

  formatTime(milliseconds: number, tenths = false): string {
    const duration = Math.max(0, Math.floor(milliseconds));
    const minutes = Math.floor(duration / 60_000)
      .toString()
      .padStart(2, '0');
    const seconds = Math.floor((duration % 60_000) / 1_000)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}${tenths ? `.${Math.floor((duration % 1_000) / 100)}` : ''}`;
  }

  stateLabel(): string {
    const round = this.store.round();
    if (!round) return 'Ready to play';
    switch (round.outcome) {
      case 'SOLVED':
        return 'Solved';
      case 'REVEALED':
        return 'Solution revealed';
      case 'SKIPPED':
        return 'Skipped';
      default:
        return this.store.capturedMs() === null ? 'Thinking' : 'Time to answer';
    }
  }
}
