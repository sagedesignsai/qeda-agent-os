/**
 * components/assets/AssetInput.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Integrated asset picker for PromptInput footer.
 *
 * This is a footerRight button that:
 * - Opens AssetPicker dialog
 * - Shows badge count of selected assets
 * - Integrates with useAssetReferenceContext
 * - Works in ChatInput, CopilotPanel, and all copilot surfaces
 *
 * Usage:
 *   <ChatInput
 *     assetControls={
 *       <AssetInput
 *         contextId={sessionId}
 *         projectId={projectId}
 *         onAssetsChange={(refs) => handleAssets(refs)}
 *       />
 *     }
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback, useMemo } from 'react';
import { FileIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AssetPicker } from '@/components/assets/AssetPicker';
import { useAssetReferenceContext, type AssetReference } from '@/contexts/AssetReferenceContext';
import type { ProjectFileSelection } from '@/lib/project-files';
import { cn } from '@/lib/utils';

interface AssetInputProps {
  /** Unique context ID (e.g., 'chat-123', 'copilot-task', etc.) */
  contextId: string;
  /** Project to scope picker to */
  projectId?: string | null;
  /** Called when assets are added/removed */
  onAssetsChange?: (references: AssetReference[]) => void;
  /** Button size and styling */
  className?: string;
  /** Show button even with no assets */
  alwaysVisible?: boolean;
}

export function AssetInput({
  contextId,
  projectId,
  onAssetsChange,
  className,
  alwaysVisible = true,
}: AssetInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { references, removeReference } = useAssetReferenceContext(contextId);

  const handleAssetSelect = useCallback(
    (files: ProjectFileSelection[]) => {
      // Assets are already added by AssetPicker → context
      // Just notify parent of the full list
      onAssetsChange?.(references);
      setPickerOpen(false);
    },
    [references, onAssetsChange]
  );

  const handleRemoveAsset = useCallback(
    (refId: string) => {
      removeReference(refId);
      // Notify parent after removal
      const remaining = references.filter((r) => r.id !== refId);
      onAssetsChange?.(remaining);
    },
    [references, removeReference, onAssetsChange]
  );

  const hasAssets = references.length > 0;
  const shouldShow = alwaysVisible || hasAssets;

  if (!shouldShow) {
    return null;
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={hasAssets ? 'secondary' : 'ghost'}
              onClick={() => setPickerOpen(true)}
              className={cn(
                'relative h-8 w-8',
                hasAssets && 'ring-1 ring-primary/50',
                className
              )}
              title={
                hasAssets
                  ? `${references.length} asset${references.length !== 1 ? 's' : ''} added`
                  : 'Add assets to send with message'
              }
            >
              <FileIcon className="size-4" />
              {hasAssets && (
                <Badge
                  variant="default"
                  className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
                >
                  {references.length}
                </Badge>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {hasAssets ? (
              <div className="space-y-1">
                <p className="font-medium">
                  {references.length} asset{references.length !== 1 ? 's' : ''} ready
                </p>
                <ul className="text-[10px]">
                  {references.slice(0, 3).map((ref) => (
                    <li key={ref.id}>{ref.fileName}</li>
                  ))}
                  {references.length > 3 && (
                    <li className="text-muted-foreground">
                      +{references.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              'Add assets'
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Asset picker dialog */}
      <AssetPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        contextId={contextId}
        kind="all"
        projectId={projectId}
        multiple
        onSelect={handleAssetSelect}
      />

      {/* Display mini references when present */}
      {hasAssets && (
        <div className="flex gap-1 items-center">
          {references.map((ref) => (
            <button
              key={ref.id}
              onClick={() => handleRemoveAsset(ref.id)}
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-1 text-xs',
                'bg-primary/10 hover:bg-primary/20 transition-colors',
                'text-primary border border-primary/20'
              )}
              title={`Remove ${ref.fileName}`}
            >
              <span className="truncate max-w-[120px]">{ref.fileName}</span>
              <span className="text-primary/60 hover:text-primary text-lg leading-none">×</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
