/**
 * renderer/pages/MotionBrowser.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Project browser and new-project entry point for Motion. Bundle operations
 * stay in main; this page works only with safe project summaries and IPC.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowUpRightIcon, CopyIcon, FolderOpenIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';

import type { MotionProjectSummary } from '@/main/ipc/channels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PageHeader } from '@/components/PageHeader';

type ProjectMode = 'starter' | 'blank';

export default function MotionBrowser() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<MotionProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'name' | 'duration'>('recent');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<ProjectMode>('starter');
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electron.ipc.invoke<{ projects: MotionProjectSummary[] }>('motion:list-projects', { includeMissing: true });
      setProjects(result.projects);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const visibleProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return projects
      .filter((project) => !normalized || project.name.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === 'duration'
          ? b.duration - a.duration
          : (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt));
  }, [projects, query, sort]);

  const createProject = async () => {
    const cleanName = name.trim();
    if (!cleanName || creating) return;
    setCreating(true);
    setError(null);
    try {
      const result = await window.electron.ipc.invoke<{ projectId: string; path: string }>('motion:create-project', {
        name: cleanName,
        blank: mode === 'blank',
      });
      setCreateOpen(false);
      navigate(`/motion/${encodeURIComponent(result.projectId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  };

  const duplicateProject = async (project: MotionProjectSummary) => {
    try {
      const result = await window.electron.ipc.invoke<{ projectId: string }>('motion:duplicate-project', { projectId: project.id });
      await reload();
      navigate(`/motion/${encodeURIComponent(result.projectId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const renameProject = async (project: MotionProjectSummary) => {
    const nextName = window.prompt('Rename Motion project', project.name)?.trim();
    if (!nextName || nextName === project.name) return;
    try {
      await window.electron.ipc.invoke('motion:rename-project', { projectId: project.id, name: nextName });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const deleteProject = async (project: MotionProjectSummary) => {
    if (!window.confirm(`Move “${project.name}” to the trash? Its project bundle will be removed from Motion.`)) return;
    try {
      await window.electron.ipc.invoke('motion:delete-project', { projectId: project.id });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const openProject = (project: MotionProjectSummary) => {
    if (!project.missing) navigate(`/motion/${encodeURIComponent(project.id)}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        crumbs={[{ label: 'Motion' }]}
        meta={<Badge variant="outline" className="text-[10px]">{projects.length} projects</Badge>}
        actions={<Button type="button" size="sm" onClick={() => { setName(''); setCreateOpen(true); }}><PlusIcon data-icon="inline-start" />New project</Button>}
      />
      <ScrollArea className="min-h-0 flex-1">
        <main className="mx-auto max-w-6xl space-y-6 p-5 md:p-8">
          <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 md:p-8">
            <div className="pointer-events-none absolute -right-10 -top-16 size-64 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Motion Studio</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">Turn a scene into a story.</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Build a product showcase from editable scenes, animation, and your own media. Projects stay local and open offline.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button type="button" onClick={() => { setMode('starter'); setName(''); setCreateOpen(true); }}><PlusIcon data-icon="inline-start" />Start with a composition</Button>
                <Button type="button" variant="outline" onClick={() => { setMode('blank'); setName(''); setCreateOpen(true); }}>Start blank</Button>
              </div>
            </div>
          </section>

          <section aria-labelledby="motion-projects-heading">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 id="motion-projects-heading" className="mr-auto text-sm font-semibold">Your projects</h2>
              <label className="relative w-full max-w-64">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search Motion projects" className="h-8 pl-8 text-xs" />
              </label>
              <select aria-label="Sort Motion projects" className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                <option value="recent">Recently opened</option><option value="name">Name</option><option value="duration">Duration</option>
              </select>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Refresh projects" onClick={() => void reload()}><ArrowUpRightIcon data-icon /></Button>
            </div>

            {error && <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}
            {loading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading Motion projects…</p> : visibleProjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
                <h3 className="text-sm font-medium">{query ? 'No matching projects' : 'Your first scene starts here'}</h3>
                <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{query ? 'Try another project name.' : 'Create a starter composition or begin with a clean scene.'}</p>
                {!query && <Button type="button" size="sm" className="mt-4" onClick={() => { setName(''); setCreateOpen(true); }}>Create a project</Button>}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleProjects.map((project) => (
                  <article key={project.id} className="group overflow-hidden rounded-xl border border-border/60 bg-card transition-colors hover:border-border">
                    <button type="button" disabled={project.missing} onClick={() => openProject(project)} className="block w-full text-left disabled:cursor-not-allowed">
                      <div className="relative flex aspect-[16/8] items-center justify-center overflow-hidden bg-muted/35">
                        {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" className="size-full object-cover" /> : <div className="size-20 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/30 via-accent/20 to-muted shadow-xl" />}
                        {project.missing && <Badge variant="destructive" className="absolute right-2 top-2">Missing folder</Badge>}
                      </div>
                      <div className="p-3">
                        <h3 className="truncate text-sm font-medium">{project.name}</h3>
                        <p className="mt-1 text-[11px] text-muted-foreground">{project.duration.toFixed(1)}s · {project.width} × {project.height} · {project.fps} fps · {project.sceneCount} scenes</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">Edited {new Date(project.updatedAt).toLocaleDateString()}</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 border-t border-border/50 px-2 py-1.5">
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[10px]" disabled={project.missing} onClick={() => void renameProject(project)}>Rename</Button>
                      <Button type="button" variant="ghost" size="icon" className="ml-auto size-7" aria-label={`Duplicate ${project.name}`} onClick={() => void duplicateProject(project)}><CopyIcon data-icon /></Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Reveal ${project.name}`} onClick={() => void window.electron.ipc.invoke<void>('motion:reveal-project', { projectId: project.id })}><FolderOpenIcon data-icon /></Button>
                      <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label={`Delete ${project.name}`} onClick={() => void deleteProject(project)}><Trash2Icon data-icon /></Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      </ScrollArea>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Motion project</DialogTitle>
            <DialogDescription>Choose a starting point. You can change the scene and output settings later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={mode === 'starter'} onClick={() => setMode('starter')} className={`rounded-lg border p-3 text-left ${mode === 'starter' ? 'border-primary bg-primary/5' : 'border-border/60'}`}><span className="block text-xs font-medium">Starter composition</span><span className="mt-1 block text-[10px] text-muted-foreground">A product scene with camera, lights, and animated title.</span></button>
              <button type="button" aria-pressed={mode === 'blank'} onClick={() => setMode('blank')} className={`rounded-lg border p-3 text-left ${mode === 'blank' ? 'border-primary bg-primary/5' : 'border-border/60'}`}><span className="block text-xs font-medium">Blank scene</span><span className="mt-1 block text-[10px] text-muted-foreground">A clean camera rig and headline, ready to customize.</span></button>
            </div>
            <label className="block space-y-1.5 text-xs font-medium">Project name<Input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createProject(); }} placeholder="Product launch" className="h-9" /></label>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="button" disabled={!name.trim() || creating} onClick={() => void createProject()}>{creating ? 'Creating…' : 'Create project'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
