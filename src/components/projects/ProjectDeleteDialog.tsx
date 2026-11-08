/**
 * components/projects/ProjectDeleteDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Replacement for the simple delete confirmation dialog. Shows what data is
 * attached to a project and lets the user choose per-category what to do:
 * migrate to Inbox, migrate to another project, or delete permanently.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangleIcon } from 'lucide-react';
import { toast } from 'sonner';

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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  label: string;
  description: string;
  defaultAction: DisposalActionValue;
  /** Whether to show the "Move to Inbox" option (ephemeral data skips it). */
  hasInboxOption: boolean;
  /** Whether to show the "Move to project" option. */
  hasMigrateOption: boolean;
  /** Source field in ProjectLinkedCounts; 'rollup' means task count from rollup. */
  countSource: 'rollup' | string;
}

const CATEGORIES: CategoryMeta[] = [
  {
    key: 'tasks',
    label: 'Tasks',
    description: 'Tasks and subtasks scoped to this project.',
    defaultAction: 'inbox',
    hasInboxOption: true,
    hasMigrateOption: true,
    countSource: 'rollup',
  },
  {
    key: 'documents',
    label: 'Documents',
    description: 'Notes, briefs, and templates attached to this project.',
    defaultAction: 'inbox',
    hasInboxOption: true,
    hasMigrateOption: true,
    countSource: 'documents',
  },
  {
    key: 'studioTakes',
    label: 'Studio Takes',
    description: 'Video recordings and screen captures.',
    defaultAction: 'inbox',
    hasInboxOption: true,
    hasMigrateOption: true,
    countSource: 'studioTakes',
  },
  {
    key: 'terminalSessions',
    label: 'Terminal Sessions',
    description: 'Terminal conversations and agent runs.',
    defaultAction: 'detach',
    hasInboxOption: false,
    hasMigrateOption: false,
    countSource: 'terminalSessions',
  },
  {
    key: 'chatSessions',
    label: 'Chat Sessions',
    description: 'Chat history scoped to this project.',
    defaultAction: 'detach',
    hasInboxOption: false,
    hasMigrateOption: false,
    countSource: 'chatSessions',
  },
  {
    key: 'researchRuns',
    label: 'Research Runs',
    description: 'Completed or running research investigations.',
    defaultAction: 'detach',
    hasInboxOption: false,
    hasMigrateOption: false,
    countSource: 'researchRuns',
  },
  {
    key: 'soundLabSessions',
    label: 'Sound Lab Sessions',
    description: 'Music and audio sessions.',
    defaultAction: 'detach',
    hasInboxOption: false,
    hasMigrateOption: false,
    countSource: 'soundLabSessions',
  },
  {
    key: 'codeProjects',
    label: 'Code Projects',
    description: 'Linked code repositories.',
    defaultAction: 'detach',
    hasInboxOption: false,
    hasMigrateOption: false,
    countSource: 'codeProjects',
  },
  {
    key: 'knowledgePages',
    label: 'Knowledge Pages',
    description: 'Knowledge-base pages scoped to this project.',
    defaultAction: 'detach',
    hasInboxOption: false,
    hasMigrateOption: false,
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

export function ProjectDeleteDialog({
  target,
  onCancel,
}: {
  target: ProjectRollup | null;
  onCancel: () => void;
}) {
  const { deleteProjectWithOptions, rollups } = useProjects();
  const { overview, loading: overviewLoading } = useProjectOverview(target?.project.id ?? null);
  const [deleting, setDeleting] = useState(false);
  const [actions, setActions] = useState<Record<CategoryKey, DisposalActionValue>>({});

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
    const defaults: Record<CategoryKey, DisposalActionValue> = {} as Record<
      CategoryKey,
      DisposalActionValue
    >;
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

  // Determine which categories have data and should be shown.
  const visibleCategories = useMemo(() => {
    if (!target || !overview) return [];
    const linked = overview.linked;
    return CATEGORIES.filter(
      (cat) => getCount(cat.key, target, linked) > 0,
    );
  }, [target, overview]);

  // Check if any category is set to "delete permanently".
  const hasPermanentDelete = useMemo(() => {
    return visibleCategories.some(
      (cat) => actions[cat.key] === 'delete',
    );
  }, [visibleCategories, actions]);

  const handleConfirm = async () => {
    if (!target) return;
    setDeleting(true);
    try {
      // Build options from only the visible categories.
      const options: DeleteOptions = {} as DeleteOptions;
      for (const cat of visibleCategories) {
        const action = actions[cat.key];
        if (action) {
          (options as Record<string, DisposalActionValue>)[cat.key] = action;
        }
      }
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

  return (
    <AlertDialog open={target !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent size="sm" className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="size-4 text-destructive" />
            Delete "{target.project.name}"?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This project will be permanently removed. Choose what happens to
            each category of associated data below.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Scrollable body with accordion sections */}
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {overviewLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : visibleCategories.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No associated data found.
            </p>
          ) : (
            <Accordion
              type="multiple"
              className="w-full"
              defaultValue={visibleCategories.map((c) => c.key)}
            >
              {visibleCategories.map((cat) => {
                const count = getCount(
                  cat.key,
                  target,
                  overview!.linked,
                );
                const currentAction = actions[cat.key] ?? cat.defaultAction;
                return (
                  <AccordionItem key={cat.key} value={cat.key}>
                    <AccordionTrigger className="text-left">
                      <span className="flex items-center gap-2">
                        <span className="rounded bg-muted px-1.5 text-[11px] font-medium">
                          {count} {count === 1 ? cat.label.slice(0, -1) : cat.label}
                        </span>
                        <span className="text-muted-foreground">
                          {cat.description}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pt-1">
                        {/* Move to Inbox option */}
                        {cat.hasInboxOption && (
                          <label
                            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                              currentAction === 'inbox'
                                ? 'border-primary bg-primary/5'
                                : 'border-transparent hover:bg-muted/50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`disposal-${cat.key}`}
                              checked={currentAction === 'inbox'}
                              onChange={() =>
                                updateAction(cat.key, 'inbox')
                              }
                              className="accent-primary"
                            />
                            <span>Move to Inbox</span>
                          </label>
                        )}

                        {/* Move to another project option */}
                        {cat.hasMigrateOption && otherProjects.length > 0 && (
                          <label
                            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                              typeof currentAction === 'object' &&
                              'migrate' in currentAction
                                ? 'border-primary bg-primary/5'
                                : 'border-transparent hover:bg-muted/50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`disposal-${cat.key}`}
                              checked={
                                typeof currentAction === 'object' &&
                                'migrate' in currentAction
                              }
                              onChange={() => {
                                // Default to first other project.
                                const first = otherProjects[0]?.id;
                                if (first) {
                                  updateAction(cat.key, { migrate: first });
                                }
                              }}
                              className="accent-primary"
                            />
                            <span className="flex items-center gap-2">
                              Move to
                              <Select
                                value={
                                  typeof currentAction === 'object' &&
                                  'migrate' in currentAction
                                    ? currentAction.migrate
                                    : ''
                                }
                                onValueChange={(val) => {
                                  updateAction(cat.key, { migrate: val });
                                }}
                                disabled={
                                  typeof currentAction !== 'object' ||
                                  !('migrate' in currentAction)
                                }
                              >
                                <SelectTrigger size="sm" className="h-7 w-40">
                                  <SelectValue placeholder="Select project" />
                                </SelectTrigger>
                                <SelectContent>
                                  {otherProjects.map((p) => (
                                    <SelectItem
                                      key={p.id}
                                      value={p.id}
                                    >
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </span>
                          </label>
                        )}

                        {/* Delete permanently option */}
                        <label
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                            currentAction === 'delete'
                              ? 'border-destructive bg-destructive/5 text-destructive'
                              : 'border-transparent text-destructive hover:bg-destructive/5'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`disposal-${cat.key}`}
                            checked={currentAction === 'delete'}
                            onChange={() => updateAction(cat.key, 'delete')}
                            className="accent-destructive"
                          />
                          <span>Delete permanently</span>
                        </label>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>

        {/* Warning banner for permanent deletes */}
        {hasPermanentDelete && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Some data will be permanently deleted and cannot be recovered.
            </span>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={deleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Deleting…' : 'Delete project'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
