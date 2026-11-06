/**
 * renderer/pages/TraceBrowser.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Project browser for Nova Trace. Bundle operations stay in main; this page only
 * handles safe project summaries and template-driven creation over IPC.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { FilePlus2Icon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageHeader } from '@/components/PageHeader';
import {
  NewCompositionDialog,
  type NewCompositionPayload,
} from '@/components/trace/dialogs/NewCompositionDialog';
import type { TraceProjectSummary } from '@/main/ipc/channels';

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
          <Badge variant="outline" className="text-[10px]">
            {projects.length} projects
          </Badge>
        }
        actions={
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            New composition
          </Button>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <main className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
          <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 md:p-8">
            <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-indigo-400/10 blur-3xl" />
            <div className="relative max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-400">
                Nova Trace
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                Vector motion, on a real timeline.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Keyframe SVG compositions — kinetic type, lower-thirds,
                counters, charts — with a GPU-smooth stage, property tracks, and
                exports that ship as a single animated SVG or GSAP code.
                Projects stay local and open offline.
              </p>
            </div>
          </section>

          {error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Trace compositions"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">
              Loading Trace projects…
            </p>
          ) : visibleProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 p-10 text-center">
              <FilePlus2Icon className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">
                No Trace compositions yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start from a template and make it yours.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-4"
                onClick={() => setCreateOpen(true)}
              >
                <PlusIcon data-icon="inline-start" />
                New composition
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProjects.map((project) => (
                <article
                  key={project.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/60 bg-card transition-colors hover:border-border"
                >
                  <div
                    className="flex h-28 items-center justify-center border-b border-border/40"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 45%, rgba(56,189,248,0.16), #0b1220 75%)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="size-10 rounded-full border-2 border-cyan-400/80" />
                      <span className="size-6 rounded-full border border-indigo-400/70" />
                      <span className="size-2 rounded-full bg-cyan-300" />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-4">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => {
                        if (!project.missing)
                          navigate(`/trace/${encodeURIComponent(project.id)}`);
                      }}
                    >
                      <p className="truncate text-sm font-medium">
                        {project.name}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {project.width}×{project.height} ·{' '}
                        {(project.durationMs / 1000).toFixed(1)}s ·{' '}
                        {project.elementCount} layers · {project.sceneCount}{' '}
                        scenes
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground/70">
                        rev {project.revision} ·{' '}
                        {new Date(project.updatedAt).toLocaleString()}
                      </p>
                    </button>
                    <div className="mt-3 flex items-center justify-between">
                      <Badge
                        variant={project.missing ? 'destructive' : 'outline'}
                        className="text-[10px]"
                      >
                        {project.missing ? 'Missing' : 'Local'}
                      </Badge>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
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
