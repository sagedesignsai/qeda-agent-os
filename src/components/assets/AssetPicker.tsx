/**
 * components/assets/AssetPicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * A unified file picker for importing/referencing assets across any surface.
 *
 * Wraps ProjectFileBrowserDialog with:
 * - Pre-configured kinds (images, documents, code, etc.)
 * - Integration with asset reference context
 * - Support for multiple selection modes
 * - Preview of already-referenced files
 *
 * Usage:
 *   const { isOpen, open, close } = useAssetPicker('chat-123');
 *   <AssetPicker
 *     open={isOpen}
 *     onOpenChange={close}
 *     kind="media"
 *     contextId="chat-123"
 *     projectId={activeProjectId}
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from 'react';
import { FileIcon, ImageIcon, FilesIcon, CodeIcon } from 'lucide-react';

import { ProjectFileBrowserDialog } from '@/components/projects/ProjectFileBrowserDialog';
import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';
import type { ProjectFileKind, ProjectFileSelection } from '@/lib/project-files';

export type AssetPickerKind = 'media' | 'document' | 'code' | 'all';

interface AssetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextId: string;
  kind?: AssetPickerKind;
  projectId?: string | null;
  multiple?: boolean;
  onSelect?: (files: ProjectFileSelection[]) => void;
  title?: string;
}

function kindsForType(type: AssetPickerKind): ProjectFileKind[] {
  switch (type) {
    case 'media':
      return ['image', 'video', 'audio'];
    case 'document':
      return ['document', 'text'];
    case 'code':
      return ['text', 'document'];
    case 'all':
    default:
      return [];
  }
}

function labelForKind(kind: AssetPickerKind): string {
  switch (kind) {
    case 'media':
      return 'Choose media';
    case 'document':
      return 'Choose documents';
    case 'code':
      return 'Choose code';
    case 'all':
    default:
      return 'Choose files';
  }
}

function iconForKind(kind: AssetPickerKind) {
  switch (kind) {
    case 'media':
      return ImageIcon;
    case 'document':
      return FileIcon;
    case 'code':
      return CodeIcon;
    case 'all':
    default:
      return FilesIcon;
  }
}

export function useAssetPicker(contextId: string) {
  const [isOpen, setIsOpen] = useState(false);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((prev) => !prev),
  };
}

export function AssetPicker({
  open,
  onOpenChange,
  contextId,
  kind = 'all',
  projectId,
  multiple = true,
  onSelect,
  title,
}: AssetPickerProps) {
  const context = useAssetReferenceContext(contextId);
  const acceptKinds = useMemo(() => kindsForType(kind), [kind]);
  const Icon = useMemo(() => iconForKind(kind), [kind]);

  const handleSelect = (files: ProjectFileSelection[]) => {
    // Add to context
    context.addReference(files);

    // Call optional handler
    onSelect?.(files);

    // Close
    onOpenChange(false);
  };

  return (
    <ProjectFileBrowserDialog
      open={open}
      onOpenChange={onOpenChange}
      projectId={projectId ?? null}
      mode="select"
      multiple={multiple}
      accept={acceptKinds.length > 0 ? acceptKinds : undefined}
      title={title ?? labelForKind(kind)}
      confirmLabel={`Add ${multiple ? 'files' : 'file'}`}
      onSelect={handleSelect}
    />
  );
}
