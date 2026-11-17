/**
 * components/studio/content/tabs/StudioMediaTab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Media Tab for Studio Content Panel:
 *   - External file import via native OS picker and drag-and-drop
 *   - Local media library browser & project recordings reuse
 *   - Video and audio clip cards with 1-click add and drag to timeline
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  UploadCloudIcon,
  VideoIcon,
  MusicIcon,
  ImageIcon,
  SearchIcon,
  FilmIcon,
  GlobeIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  ContentCardItem,
  type ContentItemPayload,
} from '../items/ContentCardItem';
import type { StudioTakeSummary } from '@/lib/studio-types';
import { toast } from 'sonner';
import { AssetSearchDialog } from '@/components/resources/AssetSearchDialog';
import type { DownloadResourceResult } from '@/main/ipc/channels';

interface StudioMediaTabProps {
  takes: StudioTakeSummary[];
  onAddClip: (clip: ContentItemPayload) => void;
  onNewRecording?: () => void;
}

interface ImportedAsset {
  id: string;
  name: string;
  path: string;
  type: 'video' | 'audio' | 'image';
  sizeBytes: number;
  durationMs: number;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function StudioMediaTab({
  takes,
  onAddClip,
  onNewRecording,
}: StudioMediaTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [importedAssets, setImportedAssets] = useState<ImportedAsset[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const handleAssetDownloaded = (res: DownloadResourceResult) => {
    if (!res.filePath || !res.fileName) return;
    const newAsset: ImportedAsset = {
      id: Math.random().toString(36).slice(2, 9),
      name: res.fileName,
      path: res.filePath,
      type: 'image',
      sizeBytes: res.sizeBytes ?? 0,
      durationMs: 5000,
    };
    setImportedAssets((prev) => [newAsset, ...prev]);
  };

  const handleOpenNativePicker = async () => {
    setIsImporting(true);
    try {
      const res = await window.electron.ipc.invoke<{
        canceled: boolean;
        files: Array<{
          name: string;
          path: string;
          sizeBytes: number;
          type: 'video' | 'audio' | 'image';
        }>;
      }>('studio:import-media', {
        types: ['video', 'audio', 'image'],
      });

      if (!res.canceled && res.files.length > 0) {
        const newAssets: ImportedAsset[] = res.files.map((f) => ({
          id: Math.random().toString(36).slice(2, 9),
          name: f.name,
          path: f.path,
          type: f.type,
          sizeBytes: f.sizeBytes,
          durationMs: f.type === 'image' ? 5000 : 15000, // Default duration
        }));

        setImportedAssets((prev) => [...newAssets, ...prev]);
        toast.success(`Imported ${res.files.length} media asset(s)`);
      }
    } catch {
      toast.error('Failed to import media files');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = Array.from(e.dataTransfer.files);
      const newAssets: ImportedAsset[] = dropped.map((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        let type: 'video' | 'audio' | 'image' = 'video';
        if (['mp3', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) {
          type = 'audio';
        } else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
          type = 'image';
        }

        return {
          id: Math.random().toString(36).slice(2, 9),
          name: f.name,
          path: (f as { path?: string }).path || f.name,
          type,
          sizeBytes: f.size,
          durationMs: type === 'image' ? 5000 : 15000,
        };
      });

      setImportedAssets((prev) => [...newAssets, ...prev]);
      toast.success(`Imported ${dropped.length} media asset(s)`);
    }
  };

  const filteredTakes = takes.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredImported = importedAssets.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full gap-2 overflow-y-auto overflow-x-hidden pr-1">
      {/* Search Input — Prominent with Icon */}
      <div className="relative shrink-0">
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary opacity-60 pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="h-7 pl-7 pr-2 text-xs bg-primary/5 border border-primary/30 hover:border-primary/50 focus-visible:border-primary focus-visible:ring-0 focus-visible:bg-primary/10 transition-colors"
        />
      </div>

      {/* Import Drop Zone — Prominent with Animation */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropFiles}
        className="relative flex flex-col items-center justify-center p-3 border border-dashed border-primary/50 hover:border-primary hover:bg-primary/8 rounded-md bg-primary/5 transition-all duration-200 text-center cursor-pointer group active:scale-95"
        onClick={handleOpenNativePicker}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleOpenNativePicker();
        }}
      >
        <div className="p-1.5 rounded-lg bg-primary/15 group-hover:bg-primary/25 text-primary transition-all duration-200 mb-1">
          <UploadCloudIcon className="w-4 h-4" />
        </div>
        <span className="text-xs font-semibold text-foreground">
          {isImporting ? 'Importing…' : 'Import Media'}
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5">
          Drop MP4, WebM, MOV, MP3, PNG…
        </span>
      </div>

      {/* Online Resource Search (Serper) */}
      <button
        type="button"
        onClick={() => setIsSearchModalOpen(true)}
        className="flex items-center justify-between px-2.5 py-1.5 border border-secondary/60 hover:border-secondary/80 rounded-md bg-secondary/10 hover:bg-secondary/15 transition-all duration-200 active:scale-95 text-left cursor-pointer group shrink-0"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded bg-primary/20 text-primary transition-colors duration-200">
            <GlobeIcon className="w-3 h-3" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-foreground truncate">
              Search Web
            </div>
            <div className="text-[10px] text-muted-foreground truncate">
              PNGs, mockups via Serper
            </div>
          </div>
        </div>
        <span className="text-[9px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/15 border border-primary/30 shrink-0 ml-1">
          WEB
        </span>
      </button>

      {/* Imported Media Section */}
      {filteredImported.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] font-bold tracking-wide uppercase text-foreground/60 px-1">
            Imported ({filteredImported.length})
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {filteredImported.map((asset) => (
              <ContentCardItem
                key={asset.id}
                id={asset.id}
                title={asset.name}
                subtitle={`${(asset.sizeBytes / (1024 * 1024)).toFixed(1)} MB`}
                badge={formatDuration(asset.durationMs)}
                previewNode={
                  asset.type === 'video' ? (
                    <VideoIcon className="w-6 h-6 text-indigo-400" />
                  ) : asset.type === 'audio' ? (
                    <MusicIcon className="w-6 h-6 text-teal-400" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-amber-400" />
                  )
                }
                itemData={{
                  // Images become picture-in-picture overlays; audio and video
                  // feed their dedicated tracks.
                  trackType:
                    asset.type === 'audio'
                      ? 'audio'
                      : asset.type === 'image'
                        ? 'overlays'
                        : 'video',
                  name: asset.name,
                  durationMs: asset.durationMs,
                  color:
                    asset.type === 'audio'
                      ? '#0f766e'
                      : asset.type === 'image'
                        ? '#f59e0b'
                        : '#4338ca',
                  payload: {
                    mediaUrl: asset.path,
                    filePath: asset.path,
                    kind: asset.type === 'image' ? 'image' : undefined,
                    srcPath: asset.type === 'image' ? asset.path : undefined,
                  },
                }}
                onAdd={onAddClip}
              />
            ))}
          </div>
        </div>
      )}

      {/* Project Recordings / Takes Section */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] font-bold tracking-wide uppercase text-foreground/60 px-1">
          Recordings ({filteredTakes.length})
        </div>

        {filteredTakes.length === 0 ? (
          <div className="p-2 text-center text-xs text-muted-foreground/50 border border-border/20 rounded-md">
            No recordings found.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredTakes.map((take) => (
              <ContentCardItem
                key={take.id}
                id={take.id}
                title={take.title}
                subtitle={take.sourceName || take.sourceType}
                badge={formatDuration(take.durationMs)}
                previewNode={<FilmIcon className="w-6 h-6 text-primary/70" />}
                itemData={{
                  trackType: 'video',
                  name: take.title,
                  durationMs: take.durationMs,
                  color: '#3b82f6',
                  payload: {
                    mediaUrl: take.videoPath,
                    filePath: take.videoPath,
                  },
                }}
                onAdd={onAddClip}
              />
            ))}
          </div>
        )}
      </div>

      <AssetSearchDialog
        open={isSearchModalOpen}
        onOpenChange={setIsSearchModalOpen}
        onAssetDownloaded={handleAssetDownloaded}
      />
    </div>
  );
}
