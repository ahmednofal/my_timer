/**
 * Timed task list: a side panel of named tasks, each with its own duration.
 * Runs through them once, top to bottom, independently of the interval timer.
 *
 * Reuses TimerEngine: each task becomes one IntervalStep whose label is the
 * task name, so pause/skip/complete behave exactly like the interval timer.
 */

import { TimerEngine } from '../engine/timerEngine';
import {
  type IntervalStep,
  formatDuration,
  makeGroup,
  makeSequence,
} from '../models/interval';
import { playStepBeep, playCompleteBeep } from '../audio/beep';

// ── Model ────────────────────────────────────────────────────────────

interface Task {
  name: string;
  /** Duration in seconds */
  duration: number;
}

const STORAGE_TASKS_KEY = 'my_timer_tasks';
const STORAGE_PANEL_KEY = 'my_timer_tasks_open';

/**
 * Parse a task duration. Bare numbers are minutes (like the interval DSL),
 * "M:SS" is minutes and seconds, and a trailing h/m/s unit is also accepted:
 *   "25" → 25 min, "1:30" → 1 min 30 s, "90s" → 90 s, "1.5h" → 90 min
 */
export function parseDuration(input: string): number {
  const src = input.trim().toLowerCase();

  const mmss = src.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);

  const unit = src.match(/^(\d+(?:\.\d+)?)\s*(h|m|min|s|sec)?$/);
  if (unit) {
    const n = parseFloat(unit[1]);
    switch (unit[2]) {
      case 'h':
        return Math.round(n * 3600);
      case 's':
      case 'sec':
        return Math.round(n);
      default:
        return Math.round(n * 60);
    }
  }

  return NaN;
}

function toStep(task: Task): IntervalStep {
  return { type: 'step', duration: task.duration, label: task.name };
}

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_TASKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Task =>
        typeof t?.name === 'string' && typeof t?.duration === 'number' && t.duration > 0,
    );
  } catch {
    return [];
  }
}

// ── Panel ────────────────────────────────────────────────────────────

export function initTaskPanel(): void {
  const $app = document.getElementById('app') as HTMLElement;
  const $panel = document.getElementById('tasks-panel') as HTMLElement;
  const $toggle = document.getElementById('tasks-toggle') as HTMLButtonElement;
  const $mini = document.getElementById('tasks-mini') as HTMLElement;

  const $total = document.getElementById('tasks-total') as HTMLElement;
  const $now = document.getElementById('tasks-now') as HTMLElement;
  const $nowName = document.getElementById('tasks-now-name') as HTMLElement;
  const $nowTime = document.getElementById('tasks-now-time') as HTMLElement;
  const $nowFill = document.getElementById('tasks-now-fill') as HTMLElement;

  const $form = document.getElementById('task-form') as HTMLFormElement;
  const $name = document.getElementById('task-name') as HTMLInputElement;
  const $duration = document.getElementById('task-duration') as HTMLInputElement;
  const $error = document.getElementById('task-error') as HTMLElement;
  const $list = document.getElementById('task-list') as HTMLOListElement;

  const $playBtn = document.getElementById('tasks-play-btn') as HTMLButtonElement;
  const $skipBtn = document.getElementById('tasks-skip-btn') as HTMLButtonElement;
  const $resetBtn = document.getElementById('tasks-reset-btn') as HTMLButtonElement;
  const $clearBtn = document.getElementById('tasks-clear-btn') as HTMLButtonElement;

  const engine = new TimerEngine();
  const tasks: Task[] = loadTasks();
  /** Seconds left in the current task, as last reported by the engine. */
  let remaining = 0;
  /** True while a task row is being dragged; the list isn't rebuilt then. */
  let dragging = false;

  const isActive = () => engine.state === 'running' || engine.state === 'paused';

  function save(): void {
    localStorage.setItem(STORAGE_TASKS_KEY, JSON.stringify(tasks));
  }

  /** Rebuild the engine from the task list (resets progress). */
  function reload(): void {
    engine.load(makeSequence(makeGroup(tasks.map(toStep), 1), false));
    remaining = tasks.length > 0 ? tasks[0].duration : 0;
  }

  function setOpen(open: boolean): void {
    $app.classList.toggle('tasks-open', open);
    $toggle.classList.toggle('active', open);
    localStorage.setItem(STORAGE_PANEL_KEY, String(open));
    render();
  }

  // ── Rendering ──────────────────────────────────────────────────────

  function statusOf(i: number): 'done' | 'active' | 'pending' {
    if (engine.state === 'finished') return 'done';
    if (!isActive()) return 'pending';
    const idx = engine.currentStepIndex;
    if (i < idx) return 'done';
    if (i === idx) return 'active';
    return 'pending';
  }

  function renderList(): void {
    const active = isActive();

    $list.innerHTML = '';
    tasks.forEach((task, i) => {
      const status = statusOf(i);
      const li = document.createElement('li');
      li.className = `task-item ${status}`;
      li.dataset.index = String(i);

      // Grip to reorder; done/current tasks of an active run stay put
      const grip = document.createElement('span');
      grip.className = 'task-grip';
      if (!active || status === 'pending') {
        grip.classList.add('movable');
        grip.title = 'Drag to reorder';
        for (let d = 0; d < 6; d++) grip.appendChild(document.createElement('span'));
        grip.addEventListener('pointerdown', (e) => startDrag(e, li));
      }

      const mark = document.createElement('span');
      mark.className = 'task-mark';
      mark.textContent = status === 'done' ? '✓' : status === 'active' ? '▸' : String(i + 1);

      const name = document.createElement('span');
      name.className = 'task-name';
      name.textContent = task.name;
      name.title = task.name;

      const time = document.createElement('span');
      time.className = 'task-time';
      time.textContent = formatDuration(status === 'active' ? remaining : task.duration);

      li.append(grip, mark, name, time);

      // While a run is active only upcoming tasks can be removed
      if (!active || status === 'pending') {
        const del = document.createElement('button');
        del.className = 'task-del';
        del.title = 'Remove task';
        del.textContent = '✕';
        del.addEventListener('click', () => removeTask(i));
        li.append(del);
      }

      $list.appendChild(li);
    });

    if (tasks.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'task-empty';
      empty.textContent = 'No tasks yet. Add one above.';
      $list.appendChild(empty);
    }
  }

  function render(): void {
    const active = isActive();
    const idx = engine.currentStepIndex;

    if (!dragging) renderList();

    // Total time left
    let left = 0;
    tasks.forEach((task, i) => {
      const status = statusOf(i);
      if (status === 'pending') left += task.duration;
      else if (status === 'active') left += remaining;
    });
    $total.textContent = tasks.length > 0 ? `${formatDuration(left)} left` : '';

    // "Now" card for the current task
    const current = active ? tasks[idx] : undefined;
    $now.classList.toggle('visible', !!current);
    if (current) {
      $nowName.textContent = current.name;
      $nowTime.textContent = formatDuration(remaining);
      $nowFill.style.width = `${(1 - remaining / current.duration) * 100}%`;
      $nowTime.classList.toggle('critical', remaining <= 5);
      $nowTime.classList.toggle('warning', remaining > 5 && remaining <= 15);
    }

    // Compact readout in the drag bar while the panel is collapsed
    const showMini = !!current && !$app.classList.contains('tasks-open');
    $mini.classList.toggle('visible', showMini);
    $mini.textContent = showMini ? `${formatDuration(remaining)} · ${current!.name}` : '';

    // Controls
    switch (engine.state) {
      case 'running':
        $playBtn.textContent = '⏸ Pause';
        break;
      case 'paused':
        $playBtn.textContent = '▶ Resume';
        break;
      case 'finished':
        $playBtn.textContent = '▶ Restart';
        break;
      default:
        $playBtn.textContent = '▶ Start';
    }
    $playBtn.disabled = tasks.length === 0;
    $skipBtn.disabled = !active;
    $resetBtn.disabled = engine.state === 'idle';
    $clearBtn.disabled = active || tasks.length === 0;
  }

  // ── Mutations ──────────────────────────────────────────────────────

  function addTask(name: string, duration: number): void {
    const task = { name, duration };
    tasks.push(task);
    save();
    if (isActive()) engine.appendStep(toStep(task));
    else reload();
    render();
  }

  function removeTask(i: number): void {
    if (isActive()) {
      if (statusOf(i) !== 'pending') return;
      engine.removeStep(i);
    }
    tasks.splice(i, 1);
    save();
    if (!isActive()) reload();
    render();
  }

  function moveTask(from: number, to: number): void {
    if (from === to) return;
    // The engine refuses if the run moved on during the drag (e.g. the
    // dragged task became current); then just snap the list back.
    if (isActive() && !engine.moveStep(from, to)) return;
    const [task] = tasks.splice(from, 1);
    tasks.splice(to, 0, task);
    save();
    if (!isActive()) reload();
  }

  // ── Drag to reorder ────────────────────────────────────────────────

  function startDrag(e: PointerEvent, li: HTMLLIElement): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const from = Number(li.dataset.index);
    // Movable rows always form the tail of the list, so the dragged row can
    // only be dropped before another movable row or at the very end.
    const minIndex = isActive() ? engine.currentStepIndex + 1 : 0;

    dragging = true;
    li.classList.add('dragging');
    $list.classList.add('reordering');

    const onMove = (ev: PointerEvent) => {
      // Scroll the list when dragging near its top or bottom edge
      const box = $list.getBoundingClientRect();
      if (ev.clientY < box.top + 20) $list.scrollTop -= 8;
      else if (ev.clientY > box.bottom - 20) $list.scrollTop += 8;

      const others = [...$list.querySelectorAll<HTMLLIElement>('.task-item')].filter(
        (el) => el !== li && Number(el.dataset.index) >= minIndex,
      );
      const before = others.find((el) => {
        const r = el.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (before) {
        if (li.nextElementSibling !== before) $list.insertBefore(li, before);
      } else if ($list.lastElementChild !== li) {
        $list.appendChild(li);
      }
    };

    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      $list.classList.remove('reordering');
      dragging = false;
      moveTask(from, [...$list.children].indexOf(li));
      render();
    };

    // Listen on window, not the grip: moving the row in the DOM would drop
    // pointer capture on the grip and lose the rest of the gesture.
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }

  // ── Events ─────────────────────────────────────────────────────────

  $form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $name.value.trim();
    const duration = parseDuration($duration.value);

    if (!name) {
      $error.textContent = '⚠ Give the task a name.';
      $name.focus();
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      $error.textContent = '⚠ Duration: 25, 1:30, 90s or 1h';
      $duration.focus();
      return;
    }

    $error.textContent = '';
    addTask(name, duration);
    $name.value = '';
    $name.focus();
  });

  $toggle.addEventListener('click', () => setOpen(!$app.classList.contains('tasks-open')));

  $playBtn.addEventListener('click', () => {
    if (engine.state === 'finished') reload();
    engine.toggle();
  });
  $skipBtn.addEventListener('click', () => engine.skip());
  $resetBtn.addEventListener('click', () => {
    reload();
    render();
  });
  $clearBtn.addEventListener('click', () => {
    if (isActive()) return;
    tasks.length = 0;
    save();
    reload();
    render();
  });

  engine.on('tick', (e) => {
    remaining = e.remaining;
    render();
  });

  engine.on('stepChange', () => {
    playStepBeep();
    $panel.classList.remove('flash');
    void $panel.offsetWidth; // force reflow so the animation restarts
    $panel.classList.add('flash');
  });

  engine.on('stateChange', () => render());

  engine.on('complete', () => {
    playCompleteBeep();
    remaining = 0;
    render();
  });

  // ── Init ───────────────────────────────────────────────────────────

  reload();
  setOpen(localStorage.getItem(STORAGE_PANEL_KEY) === 'true');
}
