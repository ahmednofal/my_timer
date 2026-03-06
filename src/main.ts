import './style.css';
import { parseIntervalDSL } from './parser/intervalParser';
import { TimerEngine } from './engine/timerEngine';
import { formatDuration } from './models/interval';
import { playStepBeep, playCompleteBeep } from './audio/beep';

// ── Constants ────────────────────────────────────────────────────────

const STORAGE_KEY = 'my_timer_dsl';
const STORAGE_LOOP_KEY = 'my_timer_loop';

// ── DOM refs ─────────────────────────────────────────────────────────

const $dslInput = document.getElementById('dsl-input') as HTMLInputElement;
const $loopCheck = document.getElementById('loop-check') as HTMLInputElement;
const $startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const $errorMsg = document.getElementById('error-msg') as HTMLElement;

const $timerDisplay = document.getElementById('timer-display') as HTMLElement;
const $countdown = document.getElementById('countdown') as HTMLElement;
const $stepLabel = document.getElementById('step-label') as HTMLElement;
const $loopInfo = document.getElementById('loop-info') as HTMLElement;
const $progressFill = document.getElementById('progress-fill') as HTMLElement;
const $stepTrack = document.getElementById('step-track') as HTMLElement;
const $finishedMsg = document.getElementById('finished-msg') as HTMLElement;

const $playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
const $stopBtn = document.getElementById('stop-btn') as HTMLButtonElement;
const $skipBtn = document.getElementById('skip-btn') as HTMLButtonElement;

// ── Engine ───────────────────────────────────────────────────────────

const engine = new TimerEngine();

// ── Restore saved state ──────────────────────────────────────────────

$dslInput.value = localStorage.getItem(STORAGE_KEY) || '(10 -> 25) * 4 -> 20';
$loopCheck.checked = localStorage.getItem(STORAGE_LOOP_KEY) === 'true';

// ── Event: Start button ──────────────────────────────────────────────

$startBtn.addEventListener('click', () => {
  const raw = $dslInput.value.trim();
  if (!raw) {
    showError('Please enter an interval expression.');
    return;
  }

  try {
    const seq = parseIntervalDSL(raw + ($loopCheck.checked ? ' loop' : ''));
    $errorMsg.textContent = '';
    localStorage.setItem(STORAGE_KEY, raw);
    localStorage.setItem(STORAGE_LOOP_KEY, String($loopCheck.checked));

    engine.load(seq);
    buildStepTrack();
    $timerDisplay.classList.add('visible');
    $finishedMsg.classList.remove('visible');
    engine.start();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showError(msg);
  }
});

// ── Event: Controls ──────────────────────────────────────────────────

$playPauseBtn.addEventListener('click', () => engine.toggle());
$stopBtn.addEventListener('click', () => {
  engine.stop();
  $timerDisplay.classList.remove('visible');
  $finishedMsg.classList.remove('visible');
});
$skipBtn.addEventListener('click', () => engine.skip());

// ── Engine events ────────────────────────────────────────────────────

engine.on('tick', (e) => {
  $countdown.textContent = e.remainingFormatted;
  $progressFill.style.width = `${e.stepProgress * 100}%`;

  // Color classes based on time remaining
  $countdown.classList.remove('warning', 'critical');
  if (e.remaining <= 5) {
    $countdown.classList.add('critical');
  } else if (e.remaining <= 15) {
    $countdown.classList.add('warning');
  }

  // Step info
  $stepLabel.innerHTML = `Step <span class="current-step-duration">${e.stepIndex + 1}</span> of ${e.totalSteps} &mdash; ${e.currentStep.label} interval`;

  // Loop info
  if (e.loopIteration > 0) {
    $loopInfo.textContent = `Loop #${e.loopIteration + 1}`;
  } else {
    $loopInfo.textContent = '';
  }

  // Update pills
  updateStepTrack(e.stepIndex);
});

engine.on('stepChange', () => {
  playStepBeep();
  flashScreen();
});

engine.on('stateChange', (state) => {
  switch (state) {
    case 'running':
      $playPauseBtn.textContent = '⏸ Pause';
      break;
    case 'paused':
      $playPauseBtn.textContent = '▶ Resume';
      break;
    case 'idle':
      $playPauseBtn.textContent = '▶ Start';
      break;
    case 'finished':
      $playPauseBtn.textContent = '▶ Restart';
      break;
  }
});

engine.on('complete', () => {
  playCompleteBeep();
  $finishedMsg.classList.add('visible');
  $countdown.textContent = '00:00';
});

// ── Helpers ──────────────────────────────────────────────────────────

function showError(msg: string): void {
  $errorMsg.textContent = `⚠ ${msg}`;
}

function buildStepTrack(): void {
  const steps = engine.currentSteps;
  $stepTrack.innerHTML = '';

  // Calculate proportional widths
  const totalDuration = steps.reduce((s, st) => s + st.duration, 0);
  steps.forEach((step, i) => {
    const pill = document.createElement('div');
    pill.className = 'step-pill';
    pill.title = `Step ${i + 1}: ${formatDuration(step.duration)}`;
    // Width proportional to duration, min 8px
    const pct = (step.duration / totalDuration) * 100;
    pill.style.width = `${Math.max(pct, 1.5)}%`;
    $stepTrack.appendChild(pill);
  });
}

function updateStepTrack(activeIndex: number): void {
  const pills = $stepTrack.querySelectorAll('.step-pill');
  pills.forEach((pill, i) => {
    pill.classList.remove('done', 'active');
    if (i < activeIndex) pill.classList.add('done');
    if (i === activeIndex) pill.classList.add('active');
  });
}

function flashScreen(): void {
  const app = document.getElementById('app')!;
  app.classList.remove('flash');
  // Force reflow
  void app.offsetWidth;
  app.classList.add('flash');
}

// ── Sound test buttons ──────────────────────────────────────────────

document.getElementById('test-step-sound')!.addEventListener('click', () => {
  playStepBeep();
});
document.getElementById('test-complete-sound')!.addEventListener('click', () => {
  playCompleteBeep();
});

// ── Keyboard shortcuts ──────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  // Don't intercept when typing in input
  if (document.activeElement === $dslInput) return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      engine.toggle();
      break;
    case 'KeyR':
      engine.stop();
      $timerDisplay.classList.remove('visible');
      $finishedMsg.classList.remove('visible');
      break;
    case 'KeyN':
    case 'ArrowRight':
      engine.skip();
      break;
  }
});

// ── Electron window controls ────────────────────────────────────────

const isElectron = navigator.userAgent.toLowerCase().includes('electron');

if (isElectron) {
  document.getElementById('minimize-btn')?.addEventListener('click', () => {
    window.close(); // In Electron with our config, close = hide to tray
  });

  document.getElementById('close-btn')?.addEventListener('click', () => {
    window.close();
  });
}
