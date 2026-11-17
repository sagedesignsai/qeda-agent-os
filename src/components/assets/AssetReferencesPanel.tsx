/**
 * components/assets/AssetReferencesPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays and manages a list of referenced assets in a context.
 *
 * Shows:
 * - File name, kind, and source
 * - Preview thumbnail (for images/video)
 * - Actions: reveal, open, remove
 * - Add more button
 *
 * Usage:
 *   <AssetReferencesPanel
 *     contextId="chat-123"
 *     onAddClick={() => assetPickerState.open()}
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback } from 'react';
import {
  ExternalLinkIcon,
  FolderIcon,
  PlusIcon,
  TrashIcon,
  FileIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  FileTextIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';
import type { ProjectFileKind } from '@/lib/project-files';
import { cn } from '@/lib/utils';

interface AssetReferencesPanelProps {
  contextId: string;
  onAddClick?: () => void;
  showEmpty?: boolean;
  compact?: boolean;
}

function kindIcon(kind: ProjectFileKind) {
  switch (kind) {
    case 'image':
      return ImageIcon;
    case 'video':
      return VideoIcon;
    case 'audio':
      return MusicIcon;
    case 'text':
      return FileTextIcon;
    case 'document':
      return FileTextIcon;
    default:
      return FileIcon;
  }
}

export function AssetReferencesPanel({
  contextId,
  onAddClick,
  showEmpty = true,
  compact = false,
}: AssetReferencesPanelProps) {
  const { references, removeReference, hasReference } =
    useAssetReferenceContext(contextId);

  const reveal = useCallback(
    async (ref: (typeof references)[0]) => {
      try {
        await window.electron.ipc.invoke('project-files:reveal', {
          projectId: ref.projectId,
          fileId: ref.id,
        });
      } catch {
        // File may be missing
      }
    },
    []
  );

  const openExternal = useCallback(
    async (ref: (typeof references)[0]) => {
      try {
        await window.electron.ipc.invoke('project-files:open', {
          projectId: ref.projectId,
          fileId: ref.id,
        });
      } catch {
        // File may be missing
      }
    },
    []
  );

  if (references.length === 0) {
    if (!showEmpty) return null;
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center">
        <FileIcon className="size-6 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">No assets referenced yet</p>
        {onAddClick && (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 h-7 text-xs"
            onClick={onAddClick}
          >
            <PlusIcon className="mr-1 size-3" />
            Add asset
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', compact && 'space-y-1')}>
      <div className="flex items-center justify-between">
        <p className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
          Assets ({references.length})
        </p>
        {onAddClick && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="h-6 w-6"
            onClick={onAddClick}
            title="Add an asset"
          >
            <PlusIcon className="size-3" />
          </Button>
        )}
      </div>

      <div className={cn('space-y-1', compact && 'space-y-0.5')}>
        {references.map((ref) => {
          const Icon = kindIcon(ref.fileKind as ProjectFileKind);
          return (
            <div
              key={ref.id}
              className={cn(
                'group flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 p-2 text-left transition-colors hover:bg-muted/40',
                compact && 'gap-1.5 p-1.5'
              )}
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground">
                {ref.mediaUrl && ref.fileKind === 'image' ? (
                  <img
                    src={ref.mediaUrl}
                    alt={ref.fileName}
                    className="size-full rounded object-cover"
                  />
                ) : (
                  <Icon className="size-3.5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate font-medium',
                    compact ? 'text-[10px]' : 'text-xs'
                  )}
                  title={ref.fileName}
                >
                  {ref.fileName}
                </p>
                <p className={cn('truncate text-muted-foreground', compact ? 'text-[9px]' : 'text-[10px]')}>
                  {ref.fileKind}
                </p>
              </div>

              <div className={cn('flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100', compact ? 'gap-0' : '')}>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className={compact ? 'h-5 w-5' : 'h-6 w-6'}
                  onClick={() => void reveal(ref)}
                  title="Reveal in folder"
                >
                  <FolderIcon className="size-3" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className={compact ? 'h-5 w-5' : 'h-6 w-6'}
                  onClick={() => void openExternal(ref)}
                  title="Open with default app"
                >
                  <ExternalLinkIcon className="size-3" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className={cn(compact ? 'h-5 w-5' : 'h-6 w-6', 'text-destructive hover:text-destructive')}
                  onClick={() => removeReference(ref.id)}
                  title="Remove reference"
                >
                  <TrashIcon className="size-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
