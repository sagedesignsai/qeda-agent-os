/**
 * components/projects/ActiveProjectNotice.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Says which project an AGENT is grounded in — and, critically, says so when
 * the answer is "none".
 *
 * WHY THIS EXISTS
 * ───────────────
 * The Focus Copilot can read your repository, but only by resolving a project's
 * `repo_path` from a project id. With no project it has nothing to resolve and,
 * by design, refuses rather than guessing. That refusal used to be invisible:
 * the scoped `ProjectScopeChip` returns `null` when nothing is scoped, so
 * "grounded in your repo" and "grounded in nothing at all" rendered identically.
 * The user got a non-answer with no explanation.
 *
 * THE THREE STATES, AND WHY THEY LOOK DIFFERENT
 * ─────────────────────────────────────────────
 *  1. Scoped — an explicit `?project=` on this surface. Quiet. It is a
 *     deliberate temporary lens, and the chip beside it already offers a way out.
 *  2. Restored — nothing scoped, but a project was remembered from last time.
 *     ALSO quiet, and deliberately calmer than state 1: this is the happy path
 *     and should not read as a problem just because it arrived on its own.
 *  3. None — no project anywhere. The ONLY state that gets attention colour, an
 *     explanation of the consequence, and a way to fix it.
 *
 * The whole point is that 2 and 3 are distinguishable at a glance. 3 is the only
 * one that is amber; 2 uses a different icon and different wording so the two
 * never read as the same state wearing different clothes.
 *
 * Colour is never the only signal — each state also has distinct icon, label and
 * (for 3) body copy, so it survives greyscale and colour-vision differences.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Link } from 'react-router';
import {
  FolderCheckIcon,
  FolderKanbanIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useProjectScope } from '@/hooks/use-project-scope';
import { cn } from '@/lib/utils';

export interface ActiveProjectNoticeProps {
  /**
   * Override the resolved state instead of reading the hook. Used where a
   * caller already has the scope and does not want a second subscription.
   */
  projectId?: string | null;
  projectName?: string | null;
  isDefaulted?: boolean;
  className?: string;
  /** Hide the explanatory line in the "none" state. */
  compact?: boolean;
}

function useResolvedState(overrides: ActiveProjectNoticeProps) {
  const scope = useProjectScope();
  return {
    id: overrides.projectId !== undefined ? overrides.projectId : scope.activeProjectId,
    name: overrides.projectName !== undefined ? overrides.projectName : scope.activeProjectName,
    defaulted:
      overrides.isDefaulted !== undefined ? overrides.isDefaulted : scope.isActiveProjectDefaulted,
  };
}

export function ActiveProjectNotice({
  className,
  compact,
  ...overrides
}: ActiveProjectNoticeProps) {
  const { id, name, defaulted } = useResolvedState(overrides);

  // ── State 3: no project. The only state that earns attention. ──────────────
  if (!id) {
    return (
      <div
        role="status"
        className={cn(
          'flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2',
          className,
        )}
      >
        <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-500">
            No project selected
          </p>
          {!compact && (
            <p className="text-[11px] leading-snug text-amber-700/80 dark:text-amber-500/70">
              The copilot can still plan and break down tasks, but it cannot read
              your code, files, or repository until a project is active.
            </p>
          )}
          <Link
            to="/projects"
            className="inline-block text-[11px] font-medium text-amber-600 underline underline-offset-2 hover:text-amber-500 dark:text-amber-400"
          >
            Choose a project
          </Link>
        </div>
      </div>
    );
  }

  // ── States 1 and 2: a project IS active. Both calm, but worded differently
  //    so a restored default is never mistaken for an explicit scope. ─────────
  const Icon = defaulted ? FolderCheckIcon : FolderKanbanIcon;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground',
        className,
      )}
      title={defaulted ? 'Restored from your last session' : 'Scoped to this project'}
    >
      <Icon className="size-3 shrink-0" />
      <span className="shrink-0">
        {defaulted ? 'Grounded in' : 'Scoped to'}
      </span>
      <span className="truncate font-medium text-foreground">{name ?? id}</span>
    </div>
  );
}
