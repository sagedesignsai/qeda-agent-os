/**
 * ai/task-copilot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The AI half of the ADHD focus system.
 *
 * Three focused capabilities, each a single structured call:
 *   breakdownTask   – turn a scary task into 2–8 concrete first steps
 *   expandBrainDump – turn unfiltered text into a small set of real tasks
 *   planDay         – lay tasks into a realistic, padded day of time blocks
 *
 * Every prompt is written for an ADHD user: action-first, realistically
 * scoped, calm, and explicitly anti-overwhelm. Output is schema-validated
 * through `generateObject` so callers never parse free-form JSON.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import { getSettings } from './settings.js';
import { resolveModel } from './provider.js';

type Priority = 1 | 2 | 3;

// ─── Shared model resolution ──────────────────────────────────────────────────

function activeModel() {
  const settings = getSettings();
  return resolveModel(settings.activeProvider, settings.activeModel);
}

const COACH_SYSTEM = `You are a calm, encouraging focus coach for someone with ADHD.
Principles:
- Never overwhelm. Prefer fewer, smaller, concrete items over completeness.
- Every item is action-first and starts with a verb.
- Respect energy: hardest/most-important work early, easy wins and admin later.
- Be specific enough to start in under 60 seconds.`;

// ─── Task breakdown ───────────────────────────────────────────────────────────

const BREAKDOWN_SCHEMA = z.object({
  steps: z
    .array(z.string())
    .min(2)
    .max(8)
    .describe(
      '2–6 short, concrete, action-first steps; each starts with a verb.',
    ),
  note: z.string().describe('One short, warm sentence of encouragement.'),
});

export interface TaskBreakdown {
  steps: string[];
  note: string;
}

/**
 * Break a task into a small checklist. The first step should be trivially
 * easy so starting feels frictionless.
 */
export async function breakdownTask(task: {
  title: string;
  description?: string;
}): Promise<TaskBreakdown> {
  const { object } = await generateObject({
    model: activeModel(),
    schema: BREAKDOWN_SCHEMA,
    system: COACH_SYSTEM,
    prompt: `Break this task into a short checklist that removes the activation barrier.

Title: ${task.title}
${task.description ? `Details: ${task.description}` : ''}

Rules:
- 2 to 6 steps. Fewer is better.
- The first step must take under two minutes.
- Each step is a single physical or mental action.
- No "plan to", no "continue" — concrete only.`,
  });

  return { steps: object.steps, note: object.note };
}

// ─── Brain dump ───────────────────────────────────────────────────────────────

const BRAIN_DUMP_SCHEMA = z.object({
  tasks: z
    .array(
      z.object({
        title: z
          .string()
          .describe('Imperative task title, under ~80 characters.'),
        description: z.string().describe('One clarifying sentence, or empty.'),
        priority: z
          .number()
          .int()
          .min(1)
          .max(3)
          .describe('1=high 2=medium 3=low'),
        estimate_mins: z
          .number()
          .int()
          .min(5)
          .max(480)
          .describe('Realistic single-sitting estimate in minutes.'),
      }),
    )
    .max(20),
  note: z
    .string()
    .describe('A short, reassuring overview of what you extracted.'),
});

export interface DraftTask {
  title: string;
  description: string;
  priority: Priority;
  estimate_mins: number;
}

/**
 * Narrow a model-supplied priority to the `Priority` union.
 *
 * Zod validates the 1–3 range, but it cannot express the value as a literal
 * union, so the inferred type stays `number`. The check is repeated here (and
 * throws rather than casting) so a schema/model drift surfaces as a clear
 * error instead of a bogus task priority.
 */
function toPriority(priority: number): Priority {
  if (priority === 1 || priority === 2 || priority === 3) return priority;
  throw new Error(`Model returned an out-of-range task priority: ${priority}`);
}

export interface BrainDumpResult {
  tasks: DraftTask[];
  note: string;
}

/**
 * Turn a stream-of-consciousness dump into real, deduplicated tasks. Fragments
 * that are thoughts rather than actions are silently folded into descriptions
 * instead of becoming fake tasks.
 */
export async function expandBrainDump(text: string): Promise<BrainDumpResult> {
  const { object } = await generateObject({
    model: activeModel(),
    schema: BRAIN_DUMP_SCHEMA,
    system: COACH_SYSTEM,
    prompt: `Extract actionable tasks from this brain dump.

Rules:
- Only create a task for something the person can actually *do*.
- Merge duplicates and near-duplicates.
- Keep titles imperative and short; put the useful context in the description.
- Assign priority by real consequence, not by how loudly it was mentioned.
- Estimates are in minutes and should be honest for one sitting.
- If the dump contains no clear actions, return an empty list and say so in the note.

Brain dump:
"""
${text}
"""`,
  });

  return {
    // `BRAIN_DUMP_SCHEMA` constrains priority to 1–3, but zod infers `number`
    // rather than the `1 | 2 | 3` union, so narrow it here instead of casting.
    tasks: object.tasks.map((t) => ({
      ...t,
      priority: toPriority(t.priority),
    })),
    note: object.note,
  };
}

// ─── Day planning ─────────────────────────────────────────────────────────────

const PLAN_SCHEMA = z.object({
  blocks: z
    .array(
      z.object({
        task_id: z.string().describe('Must be one of the supplied task ids.'),
        title: z.string().describe('Short label for the block.'),
        start_min: z
          .number()
          .int()
          .min(0)
          .max(1439)
          .describe('Minutes from midnight, local time.'),
        duration_min: z.number().int().min(15).max(180),
      }),
    )
    .max(12),
  note: z.string().describe('A short plan summary.'),
});

export interface PlanTask {
  id: string;
  title: string;
  priority: Priority;
  estimate_mins: number | null;
  due_at: number | null;
}

export interface BusySlot {
  title: string;
  start_min: number;
  end_min: number;
}

export interface PlanProposal {
  task_id: string;
  title: string;
  start_min: number;
  duration_min: number;
}

export interface PlanDayResult {
  blocks: PlanProposal[];
  note: string;
}

/** HH:MM for a minutes-from-midnight value (prompt readability). */
function clock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Propose a realistic day of time blocks. Returns minutes-from-midnight rather
 * than timestamps so the model never has to do epoch arithmetic; the caller
 * anchors them to a real date.
 */
export async function planDay(input: {
  tasks: PlanTask[];
  busy: BusySlot[];
  workStartMin: number;
  workEndMin: number;
}): Promise<PlanDayResult> {
  const taskLines = input.tasks
    .map(
      (t) =>
        `- id:${t.id} priority:${t.priority} estimate:${t.estimate_mins ?? '?'}min` +
        ` due:${t.due_at ? new Date(t.due_at * 1000).toISOString().slice(0, 10) : 'none'}` +
        ` title:"${t.title}"`,
    )
    .join('\n');

  const busyLines = input.busy.length
    ? input.busy
        .map((b) => `- ${clock(b.start_min)}–${clock(b.end_min)} ${b.title}`)
        .join('\n')
    : '- (nothing fixed yet)';

  const { object } = await generateObject({
    model: activeModel(),
    schema: PLAN_SCHEMA,
    system: COACH_SYSTEM,
    prompt: `Build a realistic, non-overwhelming plan for the day.

Available window: ${clock(input.workStartMin)}–${clock(input.workEndMin)}
Already fixed (do not overlap):
${busyLines}

Candidate tasks (use only these ids):
${taskLines}

Rules:
- Fit at most ${Math.max(3, Math.min(input.tasks.length, 8))} work blocks.
- Do NOT overlap the fixed items or each other.
- Leave a 10–15 minute buffer after each block.
- Put the highest-priority / hardest task first.
- Use each task's estimate; if unknown, assume 45 minutes.
- It is better to schedule too little than too much.`,
  });

  return { blocks: object.blocks, note: object.note };
}
