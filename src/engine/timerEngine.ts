/**
 * Timer engine: flattens an IntervalSequence and counts down each step.
 * Emits events so the UI can react.
 */

import {
  type IntervalSequence,
  type IntervalStep,
  flattenSequence,
  formatDuration,
} from '../models/interval';

// ── Event types ──────────────────────────────────────────────────────

export interface TimerTickEvent {
  /** Seconds remaining in current step */
  remaining: number;
  /** Formatted MM:SS remaining */
  remainingFormatted: string;
  /** Current step index (0-based) within the flat list */
  stepIndex: number;
  /** Total number of steps in one pass */
  totalSteps: number;
  /** The current step */
  currentStep: IntervalStep;
  /** Which loop iteration we're on (0-based) */
  loopIteration: number;
  /** Fraction of current step elapsed (0..1) */
  stepProgress: number;
}

export interface TimerStepChangeEvent {
  previousStep: IntervalStep | null;
  nextStep: IntervalStep;
  stepIndex: number;
  totalSteps: number;
}

export type TimerState = 'idle' | 'running' | 'paused' | 'finished';

export type TimerEventMap = {
  tick: TimerTickEvent;
  stepChange: TimerStepChangeEvent;
  stateChange: TimerState;
  complete: void;
};

type Listener<T> = (data: T) => void;

// ── Engine ───────────────────────────────────────────────────────────

export class TimerEngine {
  private sequence: IntervalSequence | null = null;
  private steps: IntervalStep[] = [];
  private stepIndex = 0;
  private remaining = 0; // seconds left in current step
  private loopIteration = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _state: TimerState = 'idle';

  // Simple event emitter
  private listeners: {
    [K in keyof TimerEventMap]?: Listener<TimerEventMap[K]>[];
  } = {};

  get state(): TimerState {
    return this._state;
  }

  get currentSteps(): IntervalStep[] {
    return this.steps;
  }

  get currentStepIndex(): number {
    return this.stepIndex;
  }

  on<K extends keyof TimerEventMap>(
    event: K,
    fn: Listener<TimerEventMap[K]>,
  ): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(fn);
  }

  off<K extends keyof TimerEventMap>(
    event: K,
    fn: Listener<TimerEventMap[K]>,
  ): void {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((f) => f !== fn) as typeof list;
    }
  }

  private emit<K extends keyof TimerEventMap>(
    event: K,
    data: TimerEventMap[K],
  ): void {
    const list = this.listeners[event];
    if (list) list.forEach((fn) => fn(data));
  }

  private setState(s: TimerState) {
    this._state = s;
    this.emit('stateChange', s);
  }

  /** Load a new sequence (resets everything). */
  load(sequence: IntervalSequence): void {
    this.stop();
    this.sequence = sequence;
    this.steps = flattenSequence(sequence);
    this.stepIndex = 0;
    this.loopIteration = 0;
    this.remaining = this.steps.length > 0 ? this.steps[0].duration : 0;
    this.setState('idle');
  }

  /** Start or resume the timer. */
  start(): void {
    if (!this.sequence || this.steps.length === 0) return;

    if (this._state === 'idle') {
      this.stepIndex = 0;
      this.remaining = this.steps[0].duration;
      this.loopIteration = 0;
      this.emitStepChange(null);
    }

    if (this._state === 'finished') {
      // Restart
      this.stepIndex = 0;
      this.remaining = this.steps[0].duration;
      this.loopIteration = 0;
      this.emitStepChange(null);
    }

    this.setState('running');
    this.emitTick();
    this.scheduleInterval();
  }

  pause(): void {
    if (this._state !== 'running') return;
    this.clearInterval();
    this.setState('paused');
  }

  resume(): void {
    if (this._state !== 'paused') return;
    this.setState('running');
    this.scheduleInterval();
  }

  /** Toggle between running and paused. */
  toggle(): void {
    if (this._state === 'running') this.pause();
    else if (this._state === 'paused') this.resume();
    else this.start();
  }

  /** Full stop — resets to beginning. */
  stop(): void {
    this.clearInterval();
    if (this.sequence && this.steps.length > 0) {
      this.stepIndex = 0;
      this.remaining = this.steps[0].duration;
      this.loopIteration = 0;
    }
    this.setState('idle');
  }

  /** Skip to next step. */
  skip(): void {
    if (this._state === 'idle' || this._state === 'finished') return;
    this.advanceStep();
  }

  // ── Internal ───────────────────────────────────────────────────────

  private scheduleInterval(): void {
    this.clearInterval();
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  private clearInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    if (this.remaining > 0) {
      this.remaining--;
      this.emitTick();
    }

    if (this.remaining <= 0) {
      this.advanceStep();
    }
  }

  private advanceStep(): void {
    const prevStep = this.steps[this.stepIndex];
    this.stepIndex++;

    if (this.stepIndex >= this.steps.length) {
      // End of pass
      if (this.sequence?.loop) {
        this.loopIteration++;
        this.stepIndex = 0;
        this.remaining = this.steps[0].duration;
        this.emitStepChange(prevStep);
        this.emitTick();
      } else {
        this.clearInterval();
        this.setState('finished');
        this.emit('complete', undefined);
      }
      return;
    }

    this.remaining = this.steps[this.stepIndex].duration;
    this.emitStepChange(prevStep);
    this.emitTick();
  }

  private emitTick(): void {
    const step = this.steps[this.stepIndex];
    if (!step) return;
    this.emit('tick', {
      remaining: this.remaining,
      remainingFormatted: formatDuration(this.remaining),
      stepIndex: this.stepIndex,
      totalSteps: this.steps.length,
      currentStep: step,
      loopIteration: this.loopIteration,
      stepProgress: 1 - this.remaining / step.duration,
    });
  }

  private emitStepChange(prev: IntervalStep | null): void {
    const next = this.steps[this.stepIndex];
    if (!next) return;
    this.emit('stepChange', {
      previousStep: prev,
      nextStep: next,
      stepIndex: this.stepIndex,
      totalSteps: this.steps.length,
    });
  }
}
