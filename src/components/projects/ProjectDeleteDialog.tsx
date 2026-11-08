/**
 * components/projects/ProjectDeleteDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Replacement for the simple delete confirmation dialog. Shows what data is
 * attached to a project and lets the user choose per-category what to do:
 * migrate to Inbox, migrate to another project, detach, or delete permanently.
 *
 * Presentation notes:
 *  - Category section cards instead of an accordion, so every option is
 *    visible at once — hidden radios inside a destructive flow are how users
 *    lose data. The body scrolls when several categories have data.
 *  - "Detach" is surfaced explicitly for ephemeral categories (chat, terminal,
 *    research, …). Those default to detach, so their non-destructive option
 *    must exist — otherwise the only visible choice is deletion.
 *  - A consequence line above the footer mirrors the chosen actions live:
 *    it names the categories set for permanent deletion, or confirms nothing
 *    will be deleted when every disposition is safe.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangleIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  useProjects,
  type DeleteOptions,
  type DisposalActionValue,
} from '@/hooks/use-projects';
import { useProjectOverview } from '@/hooks/use-project-overview';
import type { ProjectLinkedCounts, ProjectRollup } from '@/main/ipc/channels';

// ─── Category metadata ────────────────────────────────────────────────────────

interface CategoryMeta {
  key: string;
  /** Plural display label, e.g. "Chat Sessions". */
  label: string;
  /** Singular form for empty-state copy, e.g. "Chat Session". */
  singular: string;
  description: string;
  /**
   * 'content' — user-authored work that can be re-homed (Inbox / migrate).
   * 'ephemeral' — linked runtime data that stays with "detach".
   */
  kind: 'content' | 'ephemeral';
  defaultAction: DisposalActionValue;
  /** Source field in ProjectLinkedCounts; 'rollup' means task count from rollup. */
  countSource: 'rollup' | string;
}

const CATEGORIES: CategoryMeta[] = [
  {
    key: 'tasks',
    label: 'Tasks',
    singular: 'Task',
    description: 'Tasks and subtasks scoped to this project.',
    kind: 'content',
    defaultAction: 'inbox',
    countSource: 'rollup',
  },
  {
    key: 'documents',
    label: 'Documents',
    singular: 'Document',
    description: 'Notes, briefs, and templates attached to this project.',
    kind: 'content',
    defaultAction: 'inbox',
    countSource: 'documents',
  },
  {
    key: 'studioTakes',
    label: 'Studio Takes',
    singular: 'Studio Take',
    description: 'Video recordings and screen captures.',
    kind: 'content',
    defaultAction: 'inbox',
    countSource: 'studioTakes',
  },
  {
    key: 'terminalSessions',
    label: 'Terminal Sessions',
    singular: 'Terminal Session',
    description: 'Terminal conversations and agent runs.',
    kind: 'ephemeral',
    defaultAction: 'detach',
    countSource: 'terminalSessions',
  },
  {
    key: 'chatSessions',
    label: 'Chat Sessions',
    singular: 'Chat Session',
    description: 'Chat history scoped to this project.',
    kind: 'ephemeral',
    defaultAction: 'detach',
    countSource: 'chatSessions',
  },
  {
    key: 'researchRuns',
    label: 'Research Runs',
    singular: 'Research Run',
    description: 'Completed or running research investigations.',
    kind: 'ephemeral',
    defaultAction: 'detach',
    countSource: 'researchRuns',
  },
  {
    key: 'soundLabSessions',
    label: 'Sound Lab Sessions',
    singular: 'Sound Lab Session',
    description: 'Music and audio sessions.',
    kind: 'ephemeral',
    defaultAction: 'detach',
    countSource: 'soundLabSessions',
  },
  {
    key: 'codeProjects',
    label: 'Code Projects',
    singular: 'Code Project',
    description: 'Linked code repositories.',
    kind: 'ephemeral',
    defaultAction: 'detach',
    countSource: 'codeProjects',
  },
  {
    key: 'knowledgePages',
    label: 'Knowledge Pages',
    singular: 'Knowledge Page',
    description: 'Knowledge-base pages scoped to this project.',
    kind: 'ephemeral',
    defaultAction: 'detach',
    countSource: 'knowledgePages',
  },
];

type CategoryKey = (typeof CATEGORIES)[number]['key'];

function getCount(
  key: CategoryKey,
  rollup: ProjectRollup,
  linked: ProjectLinkedCounts,
): number {
  if (key === 'tasks') return rollup.taskTotal;
  const source = CATEGORIES.find((c) => c.key === key)?.countSource ?? key;
  if (source === 'rollup') return rollup.taskTotal;
  return (linked as unknown as Record<string, number>)[source] ?? 0;
}

/**
 * Stable RadioGroup option identity for a disposal action — the migrate
 * object collapses to the literal "migrate" option name.
 */
function actionToOption(action: DisposalActionValue): string {
  return typeof action === 'object' && 'migrate' in action
    ? 'migrate'
    : action;
}

/** Human list for the consequence banner: "Tasks", "A and B", "A, B +2 more". */
function formatCategoryNames(categories: string[]): string {
  if (categories.length === 0) return '';
  if (categories.length <= 2) return categories.join(' and ');
  return `${categories[0]}, ${categories[1]} +${categories.length - 2} more`;
}

export function ProjectDeleteDialog({
  target,
  onCancel,
}: {
  target: ProjectRollup | null;
  onCancel: () => void;
}) {
  const { deleteProjectWithOptions, rollups } = useProjects();
  const { overview, loading: overviewLoading } = useProjectOverview(
    target?.project.id ?? null,
  );
  const [deleting, setDeleting] = useState(false);
  const [actions, setActions] = useState<Record<CategoryKey, DisposalActionValue>>(
    {} as Record<CategoryKey, DisposalActionValue>,
  );

  // Derive the list of other projects for the migration dropdown.
  const otherProjects = useMemo(() => {
    if (!target) return [];
    return rollups
      .filter(
        (r) =>
          r.project.id !== target.project.id && r.project.status !== 'archived',
      )
      .map((r) => r.project);
  }, [rollups, target]);

  // Initialize default actions when the target or overview loads.
  useEffect(() => {
    if (!target) return;
    const defaults = {} as Record<CategoryKey, DisposalActionValue>;
    for (const cat of CATEGORIES) {
      defaults[cat.key] = cat.defaultAction;
    }
    setActions(defaults);
  }, [target]);

  const updateAction = useCallback(
    (key: CategoryKey, action: DisposalActionValue) => {
      setActions((prev) => ({ ...prev, [key]: action }));
    },
    [],
  );

  const actionFor = useCallback(
    (cat: CategoryMeta): DisposalActionValue =>
      actions[cat.key] ?? cat.defaultAction,
    [actions],
  );

  // Determine which categories have data and should be shown.
  const visibleCategories = useMemo(() => {
    if (!target || !overview) return [];
    const linked = overview.linked;
    return CATEGORIES.filter((cat) => getCount(cat.key, target, linked) > 0);
  }, [target, overview]);

  // Categories currently set to be destroyed — drives the consequence banner.
  const deletingCategories = useMemo(
    () => visibleCategories.filter((cat) => actionFor(cat) === 'delete'),
    [visibleCategories, actionFor],
  );
  const hasPermanentDelete = deletingCategories.length > 0;

  const handleConfirm = async () => {
    if (!target) return;
    // Only categories that actually carry data send instructions.
    const options = {} as DeleteOptions;
    for (const cat of visibleCategories) {
      (options as Record<string, DisposalActionValue>)[cat.key] =
        actionFor(cat);
    }
    setDeleting(true);
    try {
      const removed = await deleteProjectWithOptions(target.project.id, options);
      if (removed) {
        toast.success('Project deleted');
        onCancel();
      } else {
        toast.error('Could not delete project');
      }
    } catch {
      toast.error('Could not delete project');
    } finally {
      setDeleting(false);
    }
  };

  if (!target) return null;

  const targetName = target.project.name;
  const deletingNames = hasPermanentDelete
    ? formatCategoryNames(deletingCategories.map((cat) => cat.label))
    : '';

  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open && !deleting) onCancel();
      }}
    >
      {/*
        The `!` on max-w-lg is load-bearing: AlertDialogContent ships a
        `data-[size=sm]:max-w-xs` attribute-qualified class that plain
        `max-w-lg` cannot override (higher specificity, not a twMerge conflict).
      */}
      <AlertDialogContent size="sm" className="max-w-lg!">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle className="flex w-full min-w-0 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive ring-1 ring-destructive/20">
              <AlertTriangleIcon className="size-4.5" />
            </span>
            <span className="min-w-0 truncate">
              Delete “{targetName}”?
            </span>
          </AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            The project and its settings will be permanently removed. Choose
            what happens to the data attached to it.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Scrollable category sections */}
        <div className="max-h-[min(46vh,380px)] overflow-y-auto pr-2">
          {overviewLoading ? (
            <div className="grid gap-2.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[104px] rounded-xl" />
              ))}
            </div>
          ) : visibleCategories.length === 0 ? (
            <div className="grid place-items-center gap-1 rounded-xl border border-dashed px-6 py-8 text-center">
              <p className="text-sm font-medium">No data attached</p>
              <p className="text-xs text-muted-foreground">
                Deleting {`“${targetName}”`} removes only the project itself
                and its settings — it has no tasks, notes, or sessions.
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {visibleCategories.map((cat) => {
                const count = getCount(cat.key, target, overview!.linked);
                const current = actionFor(cat);
                const currentOption = actionToOption(current);
                const migrateTarget =
                  typeof current === 'object' && 'migrate' in current
                    ? current.migrate
                    : '';
                return (
                  <section
                    key={cat.key}
                    className="rounded-xl border bg-card/40 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid min-w-0 gap-1">
                        <span className="text-sm leading-5 font-medium">
                          {cat.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {cat.description}
                        </span>
                      </div>
                      <Badge
                        variant="secondary"
                        className="shrink-0 tabular-nums"
                        title={count === 1 ? cat.singular : cat.label}
                      >
                        {count}
                      </Badge>
                    </div>

                    <RadioGroup
                      className="mt-2.5"
                      value={currentOption}
                      onValueChange={(value) => {
                        if (value === 'migrate') {
                          const first = otherProjects[0]?.id;
                          if (first) updateAction(cat.key, { migrate: first });
                        } else {
                          updateAction(cat.key, value as DisposalActionValue);
                        }
                      }}
                    >
                      {/* Non-destructive option(s) */}
                      {cat.kind === 'content' ? (
                        <>
                          <DisposalOption
                            id={`disposal-${cat.key}-inbox`}
                            value="inbox"
                            label="Move to Inbox"
                            checked={currentOption === 'inbox'}
                          />
                          {otherProjects.length > 0 && (
                            <DisposalOption
                              id={`disposal-${cat.key}-migrate`}
                              value="migrate"
                              label="Move to another project"
                              checked={currentOption === 'migrate'}
                              trailing={
                                <Select
                                  value={migrateTarget}
                                  onValueChange={(val) => {
                                    if (val) {
                                      updateAction(cat.key, {
                                        migrate: val,
                                      });
                                    }
                                  }}
                                  disabled={currentOption !== 'migrate'}
                                >
                                  <SelectTrigger
                                    size="sm"
                                    className="w-44 shrink-0"
                                  >
                                    <SelectValue placeholder="Select project" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {otherProjects.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              }
                            />
                          )}
                        </>
                      ) : (
                        <DisposalOption
                          id={`disposal-${cat.key}-detach`}
                          value="detach"
                          label="Detach from project"
                          hint="Stays in your account, no longer linked here."
                          checked={currentOption === 'detach'}
                        />
                      )}

                      {/* Delete permanently */}
                      <DisposalOption
                        id={`disposal-${cat.key}-delete`}
                        value="delete"
                        label="Delete permanently"
                        destructive
                        checked={currentOption === 'delete'}
                      />
                    </RadioGroup>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        {/* Live consequence line */}
        {hasPermanentDelete ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs">
            <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <p>
              <span className="font-medium text-destructive">
                {deletingNames}
              </span>{' '}
              will be permanently deleted and cannot be recovered.
            </p>
          </div>
        ) : (
          !overviewLoading && (
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <p>
                <span className="font-medium text-foreground">
                  Nothing will be deleted.
                </span>{' '}
                Everything attached will be moved or unlinked.
              </p>
            </div>
          )
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={deleting}>
            Cancel
          </AlertDialogCancel>
          {/* preventDefault keeps the dialog open so "Deleting…" is visible;
              Radix would otherwise auto-close the action before the request
              resolves. */}
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={deleting}
            className="min-w-32"
          >
            {deleting ? (
              <>
                <Spinner className="size-3.5" />
                Deleting…
              </>
            ) : (
              'Delete project'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Option row ───────────────────────────────────────────────────────────────

function DisposalOption({
  id,
  value,
  label,
  hint,
  trailing,
  destructive = false,
  checked,
}: {
  id: string;
  /** RadioGroup option identity: 'inbox' | 'migrate' | 'detach' | 'delete'. */
  value: string;
  label: string;
  hint?: string;
  trailing?: ReactNode;
  destructive?: boolean;
  checked: boolean;
}) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-sm font-normal transition-colors',
        checked
          ? destructive
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-border bg-muted/70'
          : 'border-transparent hover:bg-muted/40',
      )}
    >
      <RadioGroupItem
        id={id}
        value={value}
        className={
          destructive
            ? 'data-checked:border-destructive data-checked:bg-destructive'
            : undefined
        }
      />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span
          className={cn(
            'leading-tight',
            destructive && 'text-destructive',
            destructive && checked && 'font-medium',
          )}
        >
          {label}
        </span>
        {hint && (
          <span className="text-xs text-muted-foreground leading-none">
            {hint}
          </span>
        )}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </Label>
  );
}
