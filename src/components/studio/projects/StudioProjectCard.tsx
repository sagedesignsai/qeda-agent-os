/**
 * components/studio/projects/StudioProjectCard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Video-first project card for the Studio Projects Library (CapCut/Loom style):
 *   - 16:9 aspect preview with smooth video hover playback & scrubbing
 *   - Translucent duration pill & source badge
 *   - Inline title renaming with double-click or menu
 *   - Project scope badge & relative timestamp
 *   - Dropdown menu for Quick Export MP4, Rename, and Delete
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { StudioTakeSummary } from '@/lib/studio-types';

interface StudioProjectCardProps {
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

export function StudioProjectCard({
  take,
  onOpen,
  onRename,
  onQuickExport,
  onDelete,
}: StudioProjectCardProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubProgress, setScrubProgress] = useState(0);

  // Inline rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState(take.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Sync title input with take
  useEffect(() => {
    setTitleInput(take.title);
  }, [take.title]);

  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  // Lazy-load video data URL on first hover
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
          // Fallback silently if video URL cannot be read
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
    setIsScrubbing(false);
    setScrubProgress(0);

    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;

    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setIsScrubbing(true);
    setScrubProgress(relX);

    const v = videoRef.current;
    if (v && v.duration) {
      v.currentTime = relX * v.duration;
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
      ref={cardRef}
      className="group relative flex flex-col rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/50 transition-all duration-300 select-none"
    >
      {/* ── 16:9 Video Thumbnail & Hover Scrubber ─────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open showcase take ${take.title}`}
        className="relative aspect-video w-full bg-slate-950 overflow-hidden cursor-pointer flex items-center justify-center focus:outline-hidden focus:ring-1 focus:ring-primary"
        onClick={() => onOpen(take.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(take.id);
          }
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            muted
            playsInline
            preload="metadata"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          /* Placeholder Poster */
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-slate-950 via-slate-900 to-indigo-950/40 text-muted-foreground/60 transition-transform duration-300 group-hover:scale-105">
            <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary/80 group-hover:scale-110 group-hover:bg-primary/20 transition-all">
              <PlayIcon className="w-5 h-5 ml-0.5" />
            </div>
          </div>
        )}

        {/* Source Badge (Top-Left) */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-[10px] text-white/90 font-medium">
          {take.sourceType === 'window' ? (
            <AppWindowIcon className="w-3 h-3 text-indigo-400" />
          ) : (
            <MonitorIcon className="w-3 h-3 text-teal-400" />
          )}
          <span className="truncate max-w-[110px]">
            {take.sourceName || take.sourceType}
          </span>
        </div>

        {/* Duration Badge (Bottom-Right) */}
        <div className="absolute bottom-2.5 right-2.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-mono font-medium text-white shadow-sm">
          {formatDuration(take.durationMs)}
        </div>

        {/* Hover Scrubbing Progress Bar */}
        {isScrubbing && (
          <div
            className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-primary to-indigo-400 transition-all pointer-events-none"
            style={{ width: `${Math.round(scrubProgress * 100)}%` }}
          />
        )}
      </div>

      {/* ── Metadata & Details Footer ──────────────────────────────────────── */}
      <div className="flex flex-col p-3.5 gap-1.5">
        {/* Title row & dropdown menu */}
        <div className="flex items-center justify-between gap-2 min-h-6">
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
              className="h-7 text-xs font-semibold px-2 py-0.5 bg-background/80"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <h3
              onDoubleClick={() => setIsRenaming(true)}
              onClick={() => onOpen(take.id)}
              className="text-xs font-semibold text-foreground/95 truncate cursor-pointer hover:text-primary transition-colors flex-1"
              title="Click to open, double-click to rename"
            >
              {take.title}
            </h3>
          )}

          {/* Quick Action Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                onClick={(e) => e.stopPropagation()}
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

        {/* Project Scope Badge & Timestamps */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground/80">
          <div className="flex items-center gap-1.5 min-w-0">
            {take.projectId && (
              <Badge
                variant="secondary"
                className="text-[9px] px-1.5 py-0 font-normal truncate max-w-[100px] border-border/40"
              >
                {take.projectName || take.projectId}
              </Badge>
            )}
            <span className="truncate">{formattedRelativeDate}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-[10px]">
            {take.cutCount > 0 && (
              <span className="text-muted-foreground/80 font-mono">
                {take.cutCount} {take.cutCount === 1 ? 'cut' : 'cuts'}
              </span>
            )}
            {take.zoomCount > 0 && (
              <span
                title={`${take.zoomCount} Dynamic Zooms`}
                className="flex items-center gap-0.5 text-indigo-400 font-mono"
              >
                <SparklesIcon className="w-2.5 h-2.5" />
                {take.zoomCount}
              </span>
            )}
            {take.fileSizeBytes ? (
              <span>{formatFileSize(take.fileSizeBytes)}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
