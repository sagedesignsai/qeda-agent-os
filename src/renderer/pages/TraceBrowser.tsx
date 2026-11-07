/**
 * renderer/pages/TraceBrowser.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Project browser for Nova Trace. Bundle operations stay in main; this page only
 * handles safe project summaries and template-driven creation over IPC.
 *
 * Design: the SVG previews are the hero. Minimal chrome, clean typography,
 * cards that breathe. No decorative gradient blobs or ALL-CAPS labels.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  ClockIcon,
  FilePlus2Icon,
  LayersIcon,
  LucideIcon,
  Maximize2Icon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageHeader } from '@/components/PageHeader';
import { TracePreview } from '@/components/trace/TracePreview';
import {
  NewCompositionDialog,
  type NewCompositionPayload,
} from '@/components/trace/dialogs/NewCompositionDialog';
import type { TraceProjectSummary } from '@/main/ipc/channels';

interface MetaItemProps {
  icon: LucideIcon;
  label: string;
}

function MetaItem({ icon: Icon, label }: MetaItemProps) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Icon className="size-3" />
      {label}
    </span>
  );
}

export default function TraceBrowser() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<TraceProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electron.ipc.invoke<{
        projects: TraceProjectSummary[];
      }>('trace:list-projects', { includeMissing: true });
      setProjects(result.projects);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const result = await window.electron.ipc.invoke<{
          projects: TraceProjectSummary[];
        }>('trace:list-projects', { includeMissing: true });
        if (!alive) return;
        setProjects(result.projects);
        setError(null);
      } catch (cause) {
        if (!alive) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return projects
      .filter(
        (project) =>
          !normalized || project.name.toLocaleLowerCase().includes(normalized),
      )
      .sort((a, b) =>
        (b.lastOpenedAt ?? b.updatedAt).localeCompare(
          a.lastOpenedAt ?? a.updatedAt,
        ),
      );
  }, [projects, query]);

  const createProject = async (payload: NewCompositionPayload) => {
    setError(null);
    try {
      const result = await window.electron.ipc.invoke<{
        projectId: string;
        path: string;
      }>('trace:create-project', payload);
      setCreateOpen(false);
      navigate(`/trace/${encodeURIComponent(result.projectId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const deleteProject = async (project: TraceProjectSummary) => {
    if (
      !window.confirm(
        `Delete “${project.name}”? Its Trace bundle will be removed from disk.`,
      )
    ) {
      return;
    }
    try {
      await window.electron.ipc.invoke('trace:delete-project', {
        projectId: project.id,
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        crumbs={[{ label: 'Nova Trace' }]}
        meta={
          projects.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {projects.length} composition{projects.length !== 1 ? 's' : ''}
            </span>
          ) : null
        }
        actions={
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            New composition
          </Button>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <main className="mx-auto max-w-6xl p-5 md:p-8">

          {/* Header — clean, no decorative blobs */}
          <section className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">
              Compositions
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Keyframe SVG animations with a real timeline. Projects stay local
              and work offline.
            </p>
          </section>

          {error ? (
            <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {/* Search bar */}
          <div className="mb-6">
            <div className="relative max-w-sm">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search compositions"
                className="pl-9"
              />
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                Loading compositions…
              </p>
            </div>
          ) : visibleProjects.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-20">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <FilePlus2Icon className="size-5 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium">
                {query ? 'No matching compositions' : 'No compositions yet'}
              </p>
              <p className="mt-1 max-w-xs text-center text-xs text-muted-foreground">
                {query
                  ? 'Try a different search term.'
                  : 'Start from a template and make it yours.'}
              </p>
              {!query && (
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  onClick={() => setCreateOpen(true)}
                >
                  <PlusIcon data-icon="inline-start" />
                  New composition
                </Button>
              )}
            </div>
          ) : (
            /* Project grid */
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProjects.map((project) => (
                <article
                  key={project.id}
                  className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-200 ${
                    project.missing
                      ? 'border-border/40 opacity-60'
                      : 'cursor-pointer border-border/60 hover:border-border hover:shadow-lg hover:shadow-black/5'
                  }`}
                  onClick={() => {
                    if (!project.missing)
                      navigate(`/trace/${encodeURIComponent(project.id)}`);
                  }}
                >
                  {/* Preview — the hero of the card */}
                  <div className="relative aspect-video overflow-hidden">
                    <TracePreview
                      svg={project.thumbnailSvg}
                      width="100%"
                      height="100%"
                    />
                    {/* Hover overlay with open action */}
                    {!project.missing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20" />
                    )}
                  </div>

                  {/* Info section */}
                  <div className="flex flex-1 flex-col p-4">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={(e) => e.stopPropagation()}
                      disabled={project.missing}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="flex-1 truncate text-sm font-medium">
                          {project.name}
                        </p>
                        {project.missing ? (
                          <Badge variant="destructive" className="shrink-0 text-[10px]">
                            Missing
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            Local
                          </Badge>
                        )}
                      </div>

                      {/* Metadata — icon-based, no middle dots */}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        <MetaItem
                          icon={Maximize2Icon}
                          label={`${project.width}×${project.height}`}
                        />
                        <MetaItem
                          icon={ClockIcon}
                          label={`${(project.durationMs / 1000).toFixed(1)}s`}
                        />
                        <MetaItem
                          icon={LayersIcon}
                          label={`${project.elementCount} layers`}
                        />
                      </div>
                    </button>

                    {/* Footer — revision and actions */}
                    <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
                      <span className="text-[10px] text-muted-foreground/70">
                        rev {project.revision} ·{' '}
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => void deleteProject(project)}
                        aria-label={`Delete ${project.name}`}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </ScrollArea>

      <NewCompositionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={createProject}
      />
    </div>
  );
}
