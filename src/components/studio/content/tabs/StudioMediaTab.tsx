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
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  ContentCardItem,
  type ContentItemPayload,
} from '../items/ContentCardItem';
import type { StudioTakeSummary } from '@/lib/studio-types';
import { toast } from 'sonner';

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
    <div className="flex flex-col h-full gap-3 overflow-y-auto pr-1">
      {/* Search Input */}
      <div className="relative shrink-0">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search media..."
          className="h-8 pl-8 text-xs bg-secondary/30 border-border/40 focus-visible:ring-1"
        />
      </div>

      {/* Quick Action: Record Take */}
      {onNewRecording && (
        <button
          type="button"
          onClick={onNewRecording}
          className="flex items-center justify-between px-3 py-2 border border-rose-500/30 hover:border-rose-500/60 rounded-lg bg-rose-500/5 hover:bg-rose-500/10 transition-colors text-left cursor-pointer group shrink-0"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <div>
              <div className="text-xs font-medium text-foreground group-hover:text-rose-400 transition-colors">
                Record New Take
              </div>
              <div className="text-[10px] text-muted-foreground">
                Capture screen or application window
              </div>
            </div>
          </div>
          <span className="text-[10px] font-medium text-rose-400 px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/20">
            REC
          </span>
        </button>
      )}

      {/* Import Drop Zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropFiles}
        className="relative flex flex-col items-center justify-center p-4 border border-dashed border-border/70 hover:border-primary/60 rounded-lg bg-card/20 hover:bg-card/40 transition-colors text-center cursor-pointer group"
        onClick={handleOpenNativePicker}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleOpenNativePicker();
        }}
      >
        <div className="p-2 rounded-full bg-secondary/50 group-hover:bg-primary/20 text-muted-foreground group-hover:text-primary transition-colors mb-1.5">
          <UploadCloudIcon className="w-5 h-5" />
        </div>
        <span className="text-xs font-medium text-foreground">
          {isImporting ? 'Importing...' : 'Import Media Files'}
        </span>
        <span className="text-[10px] text-muted-foreground mt-0.5">
          Drop MP4, WebM, MOV, MP3, PNG or click to browse
        </span>
      </div>

      {/* Imported Media Section */}
      {filteredImported.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
            Imported Files ({filteredImported.length})
          </div>
          <div className="grid grid-cols-2 gap-2">
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
                  trackType: asset.type === 'audio' ? 'audio' : 'video',
                  name: asset.name,
                  durationMs: asset.durationMs,
                  color: asset.type === 'audio' ? '#0f766e' : '#4338ca',
                  payload: {
                    mediaUrl: asset.path,
                    filePath: asset.path,
                  },
                }}
                onAdd={onAddClip}
              />
            ))}
          </div>
        </div>
      )}

      {/* Project Recordings / Takes Section */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          Project Recordings ({filteredTakes.length})
        </div>

        {filteredTakes.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground/60 border border-border/20 rounded-md">
            No recordings found.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
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
    </div>
  );
}
