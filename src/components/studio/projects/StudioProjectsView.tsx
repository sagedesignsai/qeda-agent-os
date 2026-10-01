/**
 * components/studio/projects/StudioProjectsView.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Master Studio Projects Library Dashboard.
 *
 * Implements:
 *   - Minimalist top toolbar: live search, Grid/List toggle, and New Recording CTA
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
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
import { StudioProjectsGrid } from './StudioProjectsGrid';
import { StudioProjectsList } from './StudioProjectsList';
import type { StudioTakeSummary } from '@/lib/studio-types';

interface StudioProjectsViewProps {
  takes: StudioTakeSummary[];
  onOpenTake: (id: string) => void;
  onNewRecording: () => void;
  onNewBlankProject?: () => void;
  onRenameTake: (id: string, newTitle: string) => Promise<void>;
  onQuickExport: (id: string) => Promise<void>;
  onDeleteTake: (id: string) => Promise<void>;
}

type ViewMode = 'grid' | 'list';

export function StudioProjectsView({
  takes,
  onOpenTake,
  onNewRecording,
  onNewBlankProject,
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
        {/* ── Minimalist Top Toolbar ─────────────────────────────────────────── */}
        <div className="border-b border-border/40 bg-card/30 px-6 py-4 backdrop-blur-md shrink-0">
          {/* Left: Section Title & Count Badge */}
          <div className="flex items-center gap-4">
            <SidebarTrigger className="-ml-1 shrink-0 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
                <VideoIcon className="w-4 h-4" />
              </div>
              <h1 className="font-semibold text-sm tracking-tight text-foreground">
                Studio Projects
              </h1>
            </div>

            <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/60 text-muted-foreground font-mono">
              {takes.length} {takes.length === 1 ? 'project' : 'projects'}
            </span>
          </div>

          {/* Right: Search, Grid/List Switcher & New Recording Button */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Live Search Input */}
              <div className="relative w-full sm:w-64">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="h-8 pl-8 pr-7 text-xs bg-secondary/30 border-border/40 focus:bg-background"
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

              {/* Segmented View Mode Toggle: Grid vs List */}
              <div className="flex items-center p-0.5 rounded-lg border border-border/40 bg-secondary/30 text-muted-foreground">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 rounded-md ${
                    viewMode === 'grid'
                      ? 'bg-background text-foreground shadow-xs font-medium'
                      : 'hover:text-foreground'
                  }`}
                  onClick={() => handleToggleViewMode('grid')}
                  title="Grid view"
                >
                  <LayoutGridIcon className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-7 w-7 rounded-md ${
                    viewMode === 'list'
                      ? 'bg-background text-foreground shadow-xs font-medium'
                      : 'hover:text-foreground'
                  }`}
                  onClick={() => handleToggleViewMode('list')}
                  title="List view"
                >
                  <ListIcon className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Secondary CTA: Blank Project */}
            <div className="flex flex-wrap items-center gap-2.5">
              {onNewBlankProject && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onNewBlankProject}
                  className="h-9 gap-2 px-3 text-xs font-medium border-border/60 hover:bg-accent/40"
                >
                  <PlusIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Blank Project</span>
                </Button>
              )}

              {/* Primary CTA: New Recording */}
              <Button
                size="sm"
                onClick={onNewRecording}
                className="h-9 gap-2 px-3 text-xs font-medium bg-gradient-to-r from-indigo-500 to-primary hover:from-indigo-600 hover:to-primary/90 text-white shadow-sm"
              >
                <VideoIcon className="w-3.5 h-3.5" />
                <span>New Recording</span>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Main Scrollable Content Area ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
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
                onRename={onRenameTake}
                onQuickExport={onQuickExport}
                onDelete={(take) => setTakePendingDelete(take)}
              />
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
