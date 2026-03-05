/**
 * Core data model for composable, repeatable interval sequences.
 *
 * DSL examples:
 *   10 -> 25                       Two intervals: 10min then 25min
 *   (10 -> 25) * 4 -> 20           Group repeated 4x, then a 20min interval
 *   (10 -> 25) * 4 -> 20  [loop]   Same but loops forever
 *
 * The tree is:
 *   IntervalSequence
 *     └─ IntervalGroup (root)
 *           ├─ IntervalStep | IntervalGroup  (children)
 *           └─ repeat: number
 */

/** A single timed interval (leaf node). Duration is in seconds. */
export interface IntervalStep {
  type: 'step';
  /** Duration in seconds */
  duration: number;
  /** Human-readable label, e.g. "10:00" */
  label: string;
}

/** A group of steps/sub-groups that repeats N times. */
export interface IntervalGroup {
  type: 'group';
  children: IntervalNode[];
  /** How many times to repeat this group (default 1). */
  repeat: number;
}

export type IntervalNode = IntervalStep | IntervalGroup;

/** Top-level sequence wrapping the root group + loop flag. */
export interface IntervalSequence {
  root: IntervalGroup;
  /** If true, the entire sequence restarts after finishing. */
  loop: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Create a step from minutes (supports decimals and MM:SS strings). */
export function makeStep(minutes: number): IntervalStep {
  const totalSeconds = Math.round(minutes * 60);
  return {
    type: 'step',
    duration: totalSeconds,
    label: formatDuration(totalSeconds),
  };
}

/** Create a step from a "MM:SS" string. */
export function makeStepFromMMSS(mmss: string): IntervalStep {
  const [minStr, secStr] = mmss.split(':');
  const mins = parseInt(minStr, 10) || 0;
  const secs = parseInt(secStr, 10) || 0;
  const totalSeconds = mins * 60 + secs;
  return {
    type: 'step',
    duration: totalSeconds,
    label: formatDuration(totalSeconds),
  };
}

export function makeGroup(
  children: IntervalNode[],
  repeat: number = 1,
): IntervalGroup {
  return { type: 'group', children, repeat };
}

export function makeSequence(
  root: IntervalGroup,
  loop: boolean = false,
): IntervalSequence {
  return { root, loop };
}

/** Format seconds into MM:SS */
export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Flatten a node tree into an ordered list of concrete steps.
 * Each step gets a sequential index for display purposes.
 */
export function flattenNode(node: IntervalNode): IntervalStep[] {
  if (node.type === 'step') return [node];

  const steps: IntervalStep[] = [];
  for (let r = 0; r < node.repeat; r++) {
    for (const child of node.children) {
      steps.push(...flattenNode(child));
    }
  }
  return steps;
}

export function flattenSequence(seq: IntervalSequence): IntervalStep[] {
  return flattenNode(seq.root);
}
