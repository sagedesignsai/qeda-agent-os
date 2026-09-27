/**
 * components/terminal/WorkflowsDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive Parameterized Workflows (Warp Pillar 4).
 *
 * Provides a command catalog where developers can select reusable runbooks,
 * interactively fill in {{parameter}} values, preview the interpolated command
 * live, and either run it directly or insert it into the composer.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getAllWorkflows,
  interpolateWorkflow,
  saveCustomWorkflow,
  deleteCustomWorkflow,
  type TerminalWorkflow,
} from '@/lib/workflows';
import { cn } from '@/lib/utils';
import {
  BookOpenIcon,
  CheckIcon,
  CopyIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  TerminalSquareIcon,
  Trash2Icon,
  SparklesIcon,
} from 'lucide-react';

interface WorkflowsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectWorkflow: (command: string, runDirectly: boolean) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  ports: 'bg-amber-900/60 text-amber-300 border-amber-700/40',
  docker: 'bg-sky-900/60 text-sky-300 border-sky-700/40',
  git: 'bg-purple-900/60 text-purple-300 border-purple-700/40',
  system: 'bg-orange-900/60 text-orange-300 border-orange-700/40',
  dev: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/40',
  custom: 'bg-violet-900/60 text-violet-300 border-violet-700/40',
};

export function WorkflowsDialog({
  open,
  onOpenChange,
  onSelectWorkflow,
}: WorkflowsDialogProps) {
  const [workflows, setWorkflows] = useState<TerminalWorkflow[]>(getAllWorkflows);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string>(() => workflows[0]?.id || '');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // New custom workflow form state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCmd, setNewCmd] = useState('');

  // Reload workflows when opening dialog
  React.useEffect(() => {
    if (open) {
      const all = getAllWorkflows();
      setWorkflows(all);
      if (!all.some((w) => w.id === selectedId) && all[0]) {
        setSelectedId(all[0].id);
      }
    }
  }, [open, selectedId]);

  const selectedWorkflow = useMemo(() => {
    return workflows.find((w) => w.id === selectedId) || workflows[0];
  }, [workflows, selectedId]);

  // Reset param values when selected workflow changes
  React.useEffect(() => {
    if (selectedWorkflow) {
      const defaults: Record<string, string> = {};
      selectedWorkflow.params.forEach((p) => {
        if (p.defaultValue !== undefined) {
          defaults[p.name] = p.defaultValue;
        }
      });
      setParamValues(defaults);
    }
  }, [selectedWorkflow]);

  // Compute live interpolated command
  const interpolatedCommand = useMemo(() => {
    if (!selectedWorkflow) return '';
    return interpolateWorkflow(selectedWorkflow.command, paramValues);
  }, [selectedWorkflow, paramValues]);

  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    return workflows.filter((w) => {
      const matchesCategory =
        selectedCategory === 'all' || w.category === selectedCategory;
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q) ||
        w.command.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [workflows, selectedCategory, search]);

  const handleCopy = () => {
    if (!interpolatedCommand) return;
    void navigator.clipboard.writeText(interpolatedCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCmd.trim()) return;

    const created = saveCustomWorkflow({
      name: newName.trim(),
      description: newDesc.trim() || 'Custom workflow',
      command: newCmd.trim(),
      category: 'custom',
      params: [],
    });

    const all = getAllWorkflows();
    setWorkflows(all);
    setSelectedId(created.id);
    setIsCreating(false);
    setNewName('');
    setNewDesc('');
    setNewCmd('');
  };

  const handleDelete = (id: string) => {
    deleteCustomWorkflow(id);
    const all = getAllWorkflows();
    setWorkflows(all);
    if (selectedId === id && all[0]) {
      setSelectedId(all[0].id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[88vw] max-w-5xl min-w-[680px] p-0 gap-0 overflow-hidden border-border bg-background shadow-2xl">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <BookOpenIcon className="size-5 text-emerald-400" />
              <div>
                <DialogTitle className="text-base font-semibold">
                  Terminal Workflows & Runbooks
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Warp-style parameterized templates. Fill variables and run or insert.
                </DialogDescription>
              </div>
            </div>
            <Button
              size="sm"
              variant={isCreating ? 'secondary' : 'outline'}
              className="h-7 gap-1.5 text-xs font-sans"
              onClick={() => setIsCreating((prev) => !prev)}
            >
              {isCreating ? 'Back to list' : (
                <>
                  <PlusIcon className="size-3.5" />
                  New Workflow
                </>
              )}
            </Button>
          </div>
        </DialogHeader>

        {isCreating ? (
          <form onSubmit={handleCreate} className="p-6 space-y-4">
            <div>
              <Label className="text-xs font-medium">Workflow Name</Label>
              <Input
                placeholder="e.g. Restart Local Dev Database"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 font-sans text-sm"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Description</Label>
              <Input
                placeholder="e.g. Stops and restarts Postgres container on port 5432"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="mt-1 font-sans text-sm"
              />
            </div>
            <div>
              <Label className="text-xs font-medium">
                Command Template (Use <code className="text-emerald-400">{'{{param}}'}</code> or <code className="text-emerald-400">{'{{param:default}}'}</code>)
              </Label>
              <Input
                placeholder="e.g. docker run -d -p {{port:5432}}:5432 postgres:{{version:16}}"
                value={newCmd}
                onChange={(e) => setNewCmd(e.target.value)}
                className="mt-1 font-mono text-xs"
                required
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                Variables inside {'{{...}}'} will automatically render as interactive input fields.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCreating(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white">
                Save Workflow
              </Button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-12 h-[520px]">
            {/* ── Left catalog pane (5 cols) ── */}
            <div className="col-span-5 border-r border-border/60 flex flex-col h-full bg-card/20">
              <div className="p-3 border-b border-border/60 space-y-2">
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground/60" />
                  <Input
                    placeholder="Search workflows..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 pl-8 text-xs font-sans"
                  />
                </div>
                {/* Category filters */}
                <div className="flex flex-wrap gap-1">
                  {(['all', 'ports', 'docker', 'git', 'system', 'dev', 'custom'] as const).map(
                    (cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          'rounded px-2 py-0.5 text-[10px] font-sans capitalize transition-colors',
                          selectedCategory === cat
                            ? 'bg-accent text-accent-foreground font-semibold'
                            : 'text-muted-foreground/75 hover:bg-muted hover:text-foreground',
                        )}
                      >
                        {cat}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {filteredWorkflows.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No workflows match your search.
                    </div>
                  ) : (
                    filteredWorkflows.map((wf) => {
                      const isSelected = selectedId === wf.id;
                      return (
                        <div
                          key={wf.id}
                          onClick={() => setSelectedId(wf.id)}
                          className={cn(
                            'group flex items-start justify-between gap-2 rounded-lg p-2.5 text-left cursor-pointer transition-colors',
                            isSelected
                              ? 'bg-accent/80 text-foreground border border-border/80'
                              : 'hover:bg-muted/60 text-muted-foreground',
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-sans text-xs font-medium text-foreground truncate">
                                {wf.name}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'h-3.5 px-1 text-[8px] uppercase tracking-wider font-mono',
                                  CATEGORY_COLORS[wf.category] ?? '',
                                )}
                              >
                                {wf.category}
                              </Badge>
                            </div>
                            <p className="mt-0.5 line-clamp-1 font-sans text-[11px] text-muted-foreground/80">
                              {wf.description}
                            </p>
                          </div>
                          {wf.isCustom && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(wf.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition-opacity"
                              title="Delete custom workflow"
                            >
                              <Trash2Icon className="size-3" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* ── Right details & parameter form (7 cols) ── */}
            <div className="col-span-7 flex flex-col h-full bg-background p-5 overflow-hidden">
              {selectedWorkflow ? (
                <div className="flex flex-col h-full justify-between">
                  <div className="space-y-4 overflow-y-auto pr-1">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-sans text-sm font-semibold text-foreground">
                          {selectedWorkflow.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-4 text-[9px] uppercase font-mono tracking-wide',
                            CATEGORY_COLORS[selectedWorkflow.category] ?? '',
                          )}
                        >
                          {selectedWorkflow.category}
                        </Badge>
                      </div>
                      <p className="mt-1 font-sans text-xs text-muted-foreground leading-relaxed">
                        {selectedWorkflow.description}
                      </p>
                    </div>

                    {/* Interactive Parameter Fields */}
                    {selectedWorkflow.params.length > 0 && (
                      <div className="rounded-lg border border-border/60 bg-card/40 p-3.5 space-y-3">
                        <div className="flex items-center gap-1.5">
                          <SparklesIcon className="size-3.5 text-amber-400" />
                          <span className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Parameters
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-2.5">
                          {selectedWorkflow.params.map((param) => (
                            <div key={param.name} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <Label className="font-mono text-xs text-foreground">
                                  {param.name}
                                </Label>
                                {param.description && (
                                  <span className="font-sans text-[10px] text-muted-foreground">
                                    {param.description}
                                  </span>
                                )}
                              </div>
                              <Input
                                value={paramValues[param.name] ?? ''}
                                placeholder={param.defaultValue || `Enter ${param.name}...`}
                                onChange={(e) =>
                                  setParamValues((prev) => ({
                                    ...prev,
                                    [param.name]: e.target.value,
                                  }))
                                }
                                className="h-7 font-mono text-xs bg-background/80"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Command Preview */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Command Preview
                        </span>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="flex items-center gap-1 text-[10px] font-sans text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {copied ? (
                            <>
                              <CheckIcon className="size-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <CopyIcon className="size-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="rounded-md border border-border/60 bg-muted/40 p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-all leading-relaxed">
                        $ {interpolatedCommand}
                      </pre>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="pt-4 border-t border-border/60 flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs font-sans h-8"
                      onClick={() => {
                        onSelectWorkflow(interpolatedCommand, false);
                        onOpenChange(false);
                      }}
                    >
                      <TerminalSquareIcon className="size-3.5" />
                      Insert into Input
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs font-sans h-8 bg-sky-600 hover:bg-sky-500 text-white"
                      onClick={() => {
                        onSelectWorkflow(interpolatedCommand, true);
                        onOpenChange(false);
                      }}
                    >
                      <PlayIcon className="size-3.5" />
                      Run Directly
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Select a workflow from the list
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
