/**
 * components/studio/projects/StudioProjectRow.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Compact media row for the Studio Projects Library (List view):
 *   - 16:9 mini-thumbnail with hover video preview
 *   - Title with inline renaming
 *   - Project scope badge & source indicator
 *   - Tabular duration & file size
 *   - Quick action buttons (Quick Export, More menu)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  MoreVerticalIcon,
  PlayIcon,
  PencilIcon,
  DownloadIcon,
  Trash2Icon,
  MonitorIcon,
  AppWindowIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { StudioTakeSummary } from '@/lib/studio-types';

interface StudioProjectRowProps {
  take: StudioTakeSummary;
  onOpen: (id: string) => void;
  onRename: (id: string, newTitle: string) => Promise<void>;
  onQuickExport: (id: string) => Promise<void>;
  onDelete: (take: StudioTakeSummary) => void;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function StudioProjectRow({
  take,
  onOpen,
  onRename,
  onQuickExport,
  onDelete,
}: StudioProjectRowProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState(take.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setTitleInput(take.title);
  }, [take.title]);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const handleMouseEnter = () => {
    if (!videoUrl) {
      void (async () => {
        try {
          const url = await window.electron.ipc.invoke<string | null>(
            'studio:read-video-data',
            { takeId: take.id },
          );
          if (url) {
            setVideoUrl(url);
          }
        } catch {
          // Fallback silently
        }
      })();
    } else {
      const v = videoRef.current;
      if (v) {
        v.play().catch(() => {});
      }
    }
  };

  const handleMouseLeave = () => {
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  };

  const handleSaveRename = async () => {
    setIsRenaming(false);
    const trimmed = titleInput.trim();
    if (!trimmed || trimmed === take.title) {
      setTitleInput(take.title);
      return;
    }
    await onRename(take.id, trimmed);
  };

  const formattedRelativeDate = (() => {
    try {
      return formatDistanceToNow(new Date(take.createdAt), { addSuffix: true });
    } catch {
      return 'recently';
    }
  })();

  const formatFileSize = (bytes: number): string => {
    if (bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-border/30 bg-card/40 hover:bg-secondary/30 hover:border-primary/40 transition-colors select-none"
    >
      {/* ── Left: 16:9 Mini Thumbnail & Info ─────────────────────────────────── */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Mini 16:9 Thumbnail */}
        <div
          role="button"
          tabIndex={0}
          aria-label={`Open showcase take ${take.title}`}
          onClick={() => onOpen(take.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpen(take.id);
            }
          }}
          className="relative w-20 aspect-video rounded-md bg-slate-950 overflow-hidden shrink-0 cursor-pointer border border-border/40 flex items-center justify-center group-hover:scale-105 transition-transform focus:outline-hidden focus:ring-1 focus:ring-primary"
        >
          {videoUrl ? (
            <video
              ref={videoRef}
              src={videoUrl}
              muted
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-slate-950 to-slate-900 text-muted-foreground/60">
              <PlayIcon className="w-4 h-4 text-primary/70" />
            </div>
          )}
        </div>

        {/* Title, Scope Badge & Timestamps */}
        <div className="flex flex-col min-w-0 flex-1 gap-0.5">
          <div className="flex items-center gap-2">
            {isRenaming ? (
              <Input
                ref={inputRef}
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={handleSaveRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSaveRename();
                  if (e.key === 'Escape') {
                    setTitleInput(take.title);
                    setIsRenaming(false);
                  }
                }}
                className="h-6 text-xs font-semibold px-2 py-0 max-w-sm bg-background/90"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => setIsRenaming(true)}
                onClick={() => onOpen(take.id)}
                className="text-xs font-semibold text-foreground/95 truncate cursor-pointer hover:text-primary transition-colors text-left bg-transparent border-0 p-0"
                title="Click to open, double-click to rename"
              >
                {take.title}
              </button>
            )}

            {take.projectId && (
              <Badge
                variant="secondary"
                className="text-[9px] px-1.5 py-0 font-normal shrink-0 border-border/40"
              >
                {take.projectName || take.projectId}
              </Badge>
            )}

            {take.zoomCount > 0 && (
              <span
                title={`${take.zoomCount} Dynamic Zooms`}
                className="flex items-center gap-0.5 text-indigo-400 font-mono text-[10px]"
              >
                <SparklesIcon className="w-2.5 h-2.5" />
                {take.zoomCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              {take.sourceType === 'window' ? (
                <AppWindowIcon className="w-3 h-3 text-indigo-400" />
              ) : (
                <MonitorIcon className="w-3 h-3 text-teal-400" />
              )}
              <span className="truncate max-w-[130px]">
                {take.sourceName || take.sourceType}
              </span>
            </span>
            <span>•</span>
            <span>{formattedRelativeDate}</span>
            {take.cutCount > 0 && (
              <>
                <span>•</span>
                <span className="font-mono">
                  {take.cutCount} {take.cutCount === 1 ? 'cut' : 'cuts'}
                </span>
              </>
            )}
            {take.fileSizeBytes ? (
              <>
                <span>•</span>
                <span>{formatFileSize(take.fileSizeBytes)}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Right: Duration & Actions ───────────────────────────────────────── */}
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {/* Tabular Duration */}
        <div className="font-mono text-xs font-medium text-muted-foreground w-12 text-right">
          {formatDuration(take.durationMs)}
        </div>

        {/* Quick Export Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100 transition-opacity"
              onClick={() => void onQuickExport(take.id)}
            >
              <DownloadIcon className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Quick Export MP4</TooltipContent>
        </Tooltip>

        {/* Dropdown Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <MoreVerticalIcon className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => onOpen(take.id)}
              className="text-xs gap-2"
            >
              <PlayIcon className="w-3.5 h-3.5" />
              Open in Editor
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setIsRenaming(true)}
              className="text-xs gap-2"
            >
              <PencilIcon className="w-3.5 h-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void onQuickExport(take.id)}
              className="text-xs gap-2"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Quick Export MP4
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(take)}
              className="text-xs gap-2 text-destructive focus:text-destructive"
            >
              <Trash2Icon className="w-3.5 h-3.5" />
              Delete Take
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
