/**
 * components/studio/projects/StudioProjectsView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Master Studio Projects Library Dashboard.
 *
 * Implements:
 *   - Dense PageHeader matching system-wide pattern: live search, Grid/List
 *     toggle, and New Recording CTA in a single compact row
 *   - Video-first Grid view (CapCut/Loom hover preview) vs compact List view
 *   - Inline renaming, quick MP4 export, and delete confirmation dialog
 *   - Filtered results and empty states
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useMemo } from 'react';
import {
  SearchIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  VideoIcon,
  XIcon,
  Layers3Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TooltipProvider } from '@/components/ui/tooltip';
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
import { PageHeader } from '@/components/PageHeader';
import { StudioProjectsGrid } from './StudioProjectsGrid';
import { StudioProjectsList } from './StudioProjectsList';
import type { StudioTakeSummary } from '@/lib/studio-types';
import type { StudioCompositionSummary } from '@/lib/studio/types';

interface StudioProjectsViewProps {
  takes: StudioTakeSummary[];
  hasMoreTakes?: boolean;
  loadingMoreTakes?: boolean;
  onLoadMore?: () => void;
  onOpenTake: (id: string) => void;
  onNewRecording: () => void;
  compositions?: StudioCompositionSummary[];
  onNewComposition?: () => void;
  onOpenComposition?: (id: string) => void;
  onEditProject?: (take: StudioTakeSummary) => void;
  onRenameTake: (id: string, newTitle: string) => Promise<void>;
  onQuickExport: (id: string) => Promise<void>;
  onDeleteTake: (id: string) => Promise<void>;
}

type ViewMode = 'grid' | 'list';

export function StudioProjectsView({
  takes,
  hasMoreTakes = false,
  loadingMoreTakes = false,
  onLoadMore = () => {},
  onOpenTake,
  onNewRecording,
  compositions = [],
  onNewComposition,
  onOpenComposition,
  onEditProject,
  onRenameTake,
  onQuickExport,
  onDeleteTake,
}: StudioProjectsViewProps) {
  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // View mode preference stored in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('studio_projects_view_mode');
      return saved === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });

  const handleToggleViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('studio_projects_view_mode', mode);
    } catch {
      // Ignore localStorage write failures
    }
  };

  // Delete dialog state
  const [takePendingDelete, setTakePendingDelete] =
    useState<StudioTakeSummary | null>(null);

  // Filtered takes based on search query
  const filteredTakes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return takes;

    return takes.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.sourceName && t.sourceName.toLowerCase().includes(q)) ||
        (t.projectId && t.projectId.toLowerCase().includes(q)),
    );
  }, [takes, searchQuery]);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full w-full bg-background overflow-hidden select-none">
        {/* ── Dense PageHeader (matches system-wide pattern) ──────────────────── */}
        <PageHeader
          crumbs={[{ label: 'Showcase Studio' }]}
          subtitle={
            takes.length > 0
              ? `${takes.length}${hasMoreTakes ? '+' : ''} project${takes.length === 1 && !hasMoreTakes ? '' : 's'}`
              : undefined
          }
          nav={
            <div className="flex items-center gap-0.5 rounded-md border p-0.5">
              {(
                [
                  { id: 'grid', icon: LayoutGridIcon, label: 'Grid view' },
                  { id: 'list', icon: ListIcon, label: 'List view' },
                ] as const
              ).map(({ id, icon: Icon, label }) => (
                <Button
                  key={id}
                  size="sm"
                  variant={viewMode === id ? 'secondary' : 'ghost'}
                  className="size-6 p-0"
                  aria-label={label}
                  aria-pressed={viewMode === id}
                  title={label}
                  onClick={() => handleToggleViewMode(id)}
                >
                  <Icon className="size-3.5" />
                </Button>
              ))}
            </div>
          }
          center={
            <div className="relative w-64">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects..."
                className="h-7 pl-8 pr-7 text-xs bg-secondary/30 border-border/40 focus:bg-background"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          }
          actions={
            <>
              {onNewComposition && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNewComposition}
                  className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                >
                  <Layers3Icon className="size-3.5" />
                  New composition
                </Button>
              )}
              <Button
                size="sm"
                onClick={onNewRecording}
                className="h-7 shrink-0 gap-1.5 text-xs"
              >
                <PlusIcon className="size-3" />
                New Recording
              </Button>
            </>
          }
        />

        {/* ── Main Scrollable Content Area ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {compositions.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Compositions</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Layered scenes built from your recordings.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {compositions.map((composition) => (
                  <button
                    key={composition.id}
                    type="button"
                    onClick={() => onOpenComposition?.(composition.id)}
                    className="group flex min-h-24 items-center gap-4 rounded-lg border border-border/60 bg-card/40 p-4 text-left transition-colors hover:border-primary/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-[#12151b]">
                      <div
                        className="flex h-8 w-12 items-center justify-center rounded border border-primary/60 bg-primary/10"
                        aria-hidden="true"
                      >
                        <Layers3Icon className="size-4 text-primary" />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium group-hover:text-primary">
                        {composition.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {composition.sceneId === 'desktop-mobile-comparison'
                          ? 'Desktop + mobile'
                          : 'App spotlight'}
                        {' · '}
                        {composition.layerCount} layers
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {composition.aspectRatio} ·{' '}
                        {(composition.durationMs / 1000).toFixed(1)} sec
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
          {takes.length === 0 ? (
            /* Empty State: Zero Takes in Entire Library */
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto animate-in fade-in duration-500 py-12">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-primary/20 border border-primary/30 flex items-center justify-center text-primary shadow-xl mb-5">
                <VideoIcon className="w-8 h-8" />
              </div>

              <h2 className="text-xl font-bold tracking-tight mb-2">
                No Studio Projects Yet
              </h2>
              <p className="text-muted-foreground text-xs leading-relaxed mb-6">
                Record any window, screen, or app. The agent will automatically
                trim silence pauses, zoom in on your cursor clicks, and generate
                a release changelog.
              </p>

              <Button
                size="sm"
                onClick={onNewRecording}
                className="gap-2 bg-gradient-to-r from-indigo-500 to-primary hover:from-indigo-600 hover:to-primary/90 text-white shadow-lg font-medium px-5"
              >
                <PlusIcon className="w-4 h-4" />
                Record First Showcase Take
              </Button>
            </div>
          ) : filteredTakes.length === 0 ? (
            /* Empty Search Filter State */
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-300">
              <SearchIcon className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">
                No matching showcase projects
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                We couldn&apos;t find anything matching &ldquo;{searchQuery}
                &rdquo;.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="text-xs h-7"
              >
                Clear Search
              </Button>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View Mode */
            <StudioProjectsGrid
              takes={filteredTakes}
              onOpen={onOpenTake}
              onEdit={onEditProject}
              onRename={onRenameTake}
              onQuickExport={onQuickExport}
              onDelete={(take) => setTakePendingDelete(take)}
            />
          ) : (
            /* List View Mode */
            <div className="max-w-5xl mx-auto">
              <StudioProjectsList
                takes={filteredTakes}
                onOpen={onOpenTake}
                onEdit={onEditProject}
                onRename={onRenameTake}
                onQuickExport={onQuickExport}
                onDelete={(take) => setTakePendingDelete(take)}
              />
            </div>
          )}
          {hasMoreTakes && filteredTakes.length > 0 && (
            <div className="flex justify-center py-6">
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMore}
                disabled={loadingMoreTakes}
                className="text-xs"
              >
                {loadingMoreTakes ? 'Loading…' : 'Load more takes'}
              </Button>
            </div>
          )}
        </div>

        {/* ── Delete Confirmation Dialog ─────────────────────────────────────── */}
        <AlertDialog
          open={!!takePendingDelete}
          onOpenChange={(open) => !open && setTakePendingDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Showcase Take?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;
                {takePendingDelete?.title}
                &rdquo;? This will permanently remove the recorded media and all
                generated zoom curves.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (takePendingDelete) {
                    const id = takePendingDelete.id;
                    setTakePendingDelete(null);
                    await onDeleteTake(id);
                  }
                }}
              >
                Delete Take
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
