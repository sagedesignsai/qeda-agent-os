/**
 * components/projects/ProjectFileBrowserDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Project File Browser / Media Selector.
 *
 * One modal, two jobs:
 *   • `browse` — the project page's Files entry point. Inspect, preview, reveal.
 *   • `select` — a reusable picker. Consumers pass `multiple` / `accept` /
 *     `confirmLabel` and receive `ProjectFileSelection[]` through `onSelect`.
 *
 * The left rail is the project's own vocabulary: folders the app knows about
 * (repo, each linked codebase, managed assets) and the database references that
 * already point at files (Studio takes, attachments, research files, RAG-indexed
 * files). The middle is a folder browser for filesystems and a flat, searchable
 * list for everything else. The right is a preview that never needs a path — the
 * media URL is an opaque catalog id resolved in main.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileArchiveIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  FolderSearchIcon,
  ImageIcon,
  Loader2Icon,
  MusicIcon,
  RefreshCwIcon,
  SearchIcon,
  VideoIcon,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useProjects } from '@/hooks/use-projects';
import { useProjectFiles } from '@/hooks/use-project-files';
import type {
  ProjectFileDirectory,
  ProjectFileEntry,
  ProjectFileKind,
  ProjectFileSelection,
  ProjectFileSource,
  ProjectFileTextResult,
} from '@/main/ipc/channels';
import {
  PROJECT_FILE_KIND_LABELS,
  PROJECT_FILE_SOURCE_LABELS,
  formatFileSize,
  isFilesystemSource,
} from '@/lib/project-files';

export interface ProjectFileBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial project. Without one the dialog falls back to the first project. */
  projectId?: string | null;
  /** Defaults to true: the picker can browse any project. */
  allowProjectSwitch?: boolean;
  mode?: 'browse' | 'select';
  multiple?: boolean;
  /** Restrict the kinds the user can pick. Omit for everything. */
  accept?: ProjectFileKind[];
  /** Restrict the list to these filename extensions, without the leading dot. */
  acceptExtensions?: string[];
  title?: string;
  confirmLabel?: string;
  onSelect?: (files: ProjectFileSelection[]) => void;
}

const FILTER_KINDS: ProjectFileKind[] = [
  'image',
  'video',
  'audio',
  'document',
  'text',
];

export function ProjectFileBrowserDialog({
  open,
  onOpenChange,
  projectId,
  allowProjectSwitch = true,
  mode = 'browse',
  multiple = false,
  accept,
  acceptExtensions,
  title = 'Project files',
  confirmLabel,
  onSelect,
}: ProjectFileBrowserDialogProps) {
  const { projects } = useProjects();

  const acceptKey = accept?.join(',') ?? '';
  const acceptKinds = useMemo<ProjectFileKind[]>(
    () => (acceptKey ? (acceptKey.split(',') as ProjectFileKind[]) : []),
    [acceptKey],
  );
  const allowedKinds =
    acceptKinds.length > 0
      ? FILTER_KINDS.filter((kind) => acceptKinds.includes(kind))
      : FILTER_KINDS;

  const extensionKey = (acceptExtensions ?? [])
    .map((extension) => extension.trim().toLowerCase().replace(/^\.+/, ''))
    .filter(Boolean)
    .join(',');
  const extensionList = useMemo(
    () => (extensionKey ? extensionKey.split(',') : undefined),
    [extensionKey],
  );

  const [pickedProjectId, setPickedProjectId] = useState<string | null>(
    projectId ?? null,
  );
  const [source, setSource] = useState<ProjectFileSource | null>(null);
  const [rootKey, setRootKey] = useState<string | null>(null);
  const [directory, setDirectory] = useState<string | null>(null);
  const [kind, setKind] = useState<ProjectFileKind | null>(
    acceptKinds.length === 1 ? acceptKinds[0] : null,
  );
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  const activeProjectId =
    pickedProjectId ?? projectId ?? projects[0]?.id ?? null;

  // Opening always starts from the caller's project, not the last visit.
  useEffect(() => {
    if (!open) return;
    setPickedProjectId(projectId ?? null);
    setSource(null);
    setRootKey(null);
    setDirectory(null);
    setQuery('');
    setSelectedId(null);
    setCheckedIds([]);
    setKind(acceptKinds.length === 1 ? acceptKinds[0] : null);
  }, [open, projectId, acceptKinds]);

  // Changing project resets every scope that belonged to the previous one.
  useEffect(() => {
    setSource(null);
    setRootKey(null);
    setDirectory(null);
    setSelectedId(null);
    setCheckedIds([]);
  }, [activeProjectId]);

  const browsingFilesystem = source !== null && isFilesystemSource(source);

  const {
    roots,
    totals,
    files,
    directories,
    total,
    scannedAt,
    catalogTruncated,
    loading,
    error,
    refresh,
  } = useProjectFiles(activeProjectId, {
    source: source ?? undefined,
    rootKey: rootKey ?? undefined,
    directory: browsingFilesystem ? (directory ?? '') : null,
    kind: kind ?? undefined,
    extensions: extensionList,
    query,
    includeMissing: true,
    limit: 200,
  });

  const selectedEntry = useMemo(
    () => files.find((file) => file.id === selectedId) ?? null,
    [files, selectedId],
  );

  const checkedEntries = useMemo(() => {
    if (!multiple) {
      return selectedEntry ? [selectedEntry] : [];
    }
    const byId = new Map(files.map((file) => [file.id, file]));
    return checkedIds
      .map((id) => byId.get(id))
      .filter((file): file is ProjectFileEntry => Boolean(file));
  }, [files, multiple, checkedIds, selectedEntry]);

  const canConfirm =
    mode === 'select' &&
    checkedEntries.length > 0 &&
    checkedEntries.every((entry) => !entry.missing);

  const selectRail = (
    nextSource: ProjectFileSource | null,
    nextRootKey: string | null,
  ) => {
    setSource(nextSource);
    setRootKey(nextRootKey);
    setDirectory(nextSource && isFilesystemSource(nextSource) ? '' : null);
    setSelectedId(null);
    setCheckedIds([]);
    setQuery('');
  };

  const handleRowClick = (entry: ProjectFileEntry) => {
    setSelectedId(entry.id);
    if (multiple) {
      setCheckedIds((current) =>
        current.includes(entry.id)
          ? current.filter((id) => id !== entry.id)
          : [...current, entry.id],
      );
    }
  };

  const handleFolderClick = (folder: ProjectFileDirectory) => {
    setDirectory(folder.path);
    setSelectedId(null);
    setQuery('');
  };

  const handleConfirm = useCallback(
    (entries: ProjectFileEntry[]) => {
      if (mode !== 'select' || !onSelect) return;
      const usable = entries.filter((entry) => !entry.missing);
      if (usable.length === 0) return;
      onSelect(
        usable.map((entry) => ({
          projectId: entry.projectId,
          id: entry.id,
          name: entry.name,
          path: entry.path,
          kind: entry.kind,
          mimeType: entry.mimeType,
          sizeBytes: entry.sizeBytes,
          mediaUrl: entry.mediaUrl,
          source: entry.primarySource,
        })),
      );
      onOpenChange(false);
    },
    [mode, onSelect, onOpenChange],
  );

  const reveal = useCallback(
    async (entry: ProjectFileEntry) => {
      if (!activeProjectId) return;
      try {
        await window.electron.ipc.invoke('project-files:reveal', {
          projectId: activeProjectId,
          fileId: entry.id,
        });
      } catch {
        // The item may have disappeared since the scan; the next refresh says so.
      }
    },
    [activeProjectId],
  );

  const openExternally = useCallback(
    async (entry: ProjectFileEntry) => {
      if (!activeProjectId) return;
      try {
        await window.electron.ipc.invoke('project-files:open', {
          projectId: activeProjectId,
          fileId: entry.id,
        });
      } catch {
        // Same as reveal: a stale row must not throw at the user.
      }
    },
    [activeProjectId],
  );

  const breadcrumb = useMemo(() => {
    if (!browsingFilesystem) return [];
    const current = directory ?? '';
    const segments = current ? current.split('/') : [];
    return [
      { label: 'Root', value: '' },
      ...segments.map((segment, index) => ({
        label: segment,
        value: segments.slice(0, index + 1).join('/'),
      })),
    ];
  }, [browsingFilesystem, directory]);

  const selectedRoot = roots.find((root) => root.key === rootKey) ?? null;
  const missingRoots = roots.filter((root) => !root.exists);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(82vh,760px)] w-[min(1120px,94vw)] max-w-[94vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-3 pr-10">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
              <FolderSearchIcon className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{title}</DialogTitle>
              <DialogDescription className="truncate">
                Files in this project&apos;s folders, plus everything its
                records reference.
              </DialogDescription>
            </div>

            {allowProjectSwitch && (
              <Select
                value={activeProjectId ?? undefined}
                onValueChange={(value) => setPickedProjectId(value)}
              >
                <SelectTrigger className="h-8 w-[220px] shrink-0 text-xs">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              size="icon-sm"
              variant="ghost"
              title="Rescan this project"
              onClick={() => void refresh()}
              disabled={!activeProjectId || loading}
            >
              <RefreshCwIcon
                className={cn('size-4', loading && 'animate-spin')}
              />
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)_320px]">
          {/* Left rail */}
          <div className="min-h-0 overflow-y-auto border-r bg-muted/20 p-2">
            <RailButton
              active={source === null}
              icon={FileIcon}
              label="All files"
              onClick={() => selectRail(null, null)}
            />

            <RailSection label="Folders" />
            {roots.length === 0 && (
              <p className="px-2 py-1 text-[11px] text-muted-foreground">
                No folders configured.
              </p>
            )}
            {roots.map((root) => {
              const rootSource: ProjectFileSource =
                root.type === 'repo'
                  ? 'repo'
                  : root.type === 'code-project'
                    ? 'code-project'
                    : 'assets';
              const Icon = root.type === 'assets' ? FileIcon : FolderIcon;
              return (
                <RailButton
                  key={root.key}
                  active={source === rootSource && rootKey === root.key}
                  icon={Icon}
                  label={root.label}
                  title={root.path}
                  muted={!root.exists}
                  badge={root.exists ? undefined : 'missing'}
                  onClick={() => {
                    if (!root.exists) return;
                    selectRail(rootSource, root.key);
                  }}
                />
              );
            })}

            <RailSection label="Referenced" />
            {(
              ['studio-take', 'attachment', 'research-file', 'indexed'] as const
            ).map((item) => (
              <RailButton
                key={item}
                active={source === item}
                icon={
                  item === 'studio-take'
                    ? VideoIcon
                    : item === 'attachment'
                      ? FileTextIcon
                      : item === 'research-file'
                        ? SearchIcon
                        : FileCodeIcon
                }
                label={PROJECT_FILE_SOURCE_LABELS[item]}
                count={totals[item]}
                onClick={() => selectRail(item, null)}
              />
            ))}

            {missingRoots.length > 0 && (
              <p className="mt-2 flex items-start gap-1.5 px-2 text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
                <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                {missingRoots.length === 1
                  ? 'One folder is missing on disk.'
                  : `${missingRoots.length} folders are missing on disk.`}
              </p>
            )}
          </div>

          {/* Middle: filters + list */}
          <div className="flex min-h-0 flex-col">
            <div className="shrink-0 space-y-2 border-b p-2">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search this project…"
                    className="h-8 pl-7 text-xs"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <FilterChip
                  active={kind === null}
                  label="All types"
                  onClick={() => setKind(null)}
                />
                {allowedKinds.map((item) => (
                  <FilterChip
                    key={item}
                    active={kind === item}
                    label={PROJECT_FILE_KIND_LABELS[item]}
                    onClick={() => setKind(kind === item ? null : item)}
                  />
                ))}
              </div>

              {browsingFilesystem && (
                <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-[11px] text-muted-foreground">
                  {breadcrumb.map((crumb, index) => (
                    <span
                      key={`${crumb.value}-${index}`}
                      className="flex shrink-0 items-center gap-0.5"
                    >
                      {index > 0 && <ChevronRightIcon className="size-3" />}
                      <button
                        type="button"
                        className={cn(
                          'rounded px-1 py-0.5 hover:bg-accent hover:text-foreground',
                          index === breadcrumb.length - 1 && 'text-foreground',
                        )}
                        onClick={() => {
                          setDirectory(crumb.value);
                          setSelectedId(null);
                          setQuery('');
                        }}
                      >
                        {crumb.label}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {loading && files.length === 0 && directories.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2Icon className="size-5 animate-spin" />
                  Indexing project files…
                </div>
              )}

              {!loading && files.length === 0 && directories.length === 0 && (
                <EmptyState
                  hasProject={Boolean(activeProjectId)}
                  hasRoots={roots.some((root) => root.exists)}
                  filtered={Boolean(query) || kind !== null || source !== null}
                />
              )}

              {!browsingFilesystem &&
                files.length > 0 &&
                selectedRoot === null && (
                  <p className="px-2 py-1 text-[10px] text-muted-foreground">
                    {total} file{total === 1 ? '' : 's'}
                    {catalogTruncated ? ' (catalog truncated)' : ''}
                  </p>
                )}

              {directories.map((folder) => (
                <button
                  key={folder.path}
                  type="button"
                  onClick={() => handleFolderClick(folder)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {folder.fileCount}
                  </span>
                </button>
              ))}

              {files.map((entry) => {
                const checked = multiple
                  ? checkedIds.includes(entry.id)
                  : selectedId === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => handleRowClick(entry)}
                    onDoubleClick={() => handleConfirm([entry])}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent',
                      checked && 'bg-accent',
                      entry.missing && 'opacity-60',
                    )}
                  >
                    {multiple && (
                      <span
                        className={cn(
                          'flex size-3.5 shrink-0 items-center justify-center rounded border',
                          checked &&
                            'border-primary bg-primary text-primary-foreground',
                        )}
                      >
                        {checked && '✓'}
                      </span>
                    )}
                    <FileKindIcon kind={entry.kind} />
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={entry.path}
                    >
                      {entry.name}
                    </span>
                    {source === null && (
                      <Badge
                        variant="outline"
                        className="shrink-0 px-1 py-0 text-[9px] font-normal text-muted-foreground"
                      >
                        {PROJECT_FILE_SOURCE_LABELS[entry.primarySource]}
                      </Badge>
                    )}
                    {entry.missing && (
                      <Badge
                        variant="destructive"
                        className="shrink-0 px-1 py-0 text-[9px] font-normal"
                      >
                        Missing
                      </Badge>
                    )}
                    <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                      {formatFileSize(entry.sizeBytes)}
                    </span>
                  </button>
                );
              })}

              {!loading && files.length > 0 && total > files.length && (
                <p className="px-2 py-2 text-center text-[10px] text-muted-foreground">
                  Showing {files.length} of {total}. Narrow the search to see
                  more.
                </p>
              )}
            </div>

            <div className="shrink-0 border-t px-2 py-1.5 text-[10px] text-muted-foreground">
              {error
                ? error
                : scannedAt
                  ? `Indexed ${new Date(scannedAt * 1000).toLocaleTimeString()}`
                  : 'Not indexed yet'}
              {catalogTruncated ? ' · catalog capped' : ''}
            </div>
          </div>

          {/* Right: preview */}
          <div className="flex min-h-0 flex-col border-l bg-muted/10">
            <PreviewPanel
              projectId={activeProjectId}
              entry={selectedEntry}
              onReveal={reveal}
              onOpen={openExternally}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 items-center justify-between px-4 py-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">
            {checkedEntries.length > 0
              ? `${checkedEntries.length} selected`
              : 'Select a file to preview it'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!selectedEntry}
              onClick={() => selectedEntry && void reveal(selectedEntry)}
            >
              Reveal
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            {mode === 'select' && (
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!canConfirm}
                onClick={() => handleConfirm(checkedEntries)}
              >
                {confirmLabel ??
                  (multiple
                    ? `Select ${checkedEntries.length || ''}`.trim()
                    : 'Select')}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rail ─────────────────────────────────────────────────────────────────────

function RailSection({ label }: { label: string }) {
  return (
    <p className="mt-3 mb-1 px-2 text-[9px] font-medium tracking-wide text-muted-foreground uppercase">
      {label}
    </p>
  );
}

function RailButton({
  active,
  icon: Icon,
  label,
  count,
  badge,
  title,
  muted,
  onClick,
}: {
  active: boolean;
  icon: typeof FolderIcon;
  label: string;
  count?: number;
  badge?: string;
  title?: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-accent',
        active && 'bg-accent font-medium',
        muted && 'opacity-50',
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && (
        <span className="shrink-0 text-[9px] text-amber-600 dark:text-amber-400">
          {badge}
        </span>
      )}
      {count !== undefined && count > 0 && (
        <span className="shrink-0 text-[9px] tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
        active
          ? 'border-primary/40 bg-primary/10 text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

function FileKindIcon({ kind }: { kind: ProjectFileKind }) {
  const Icon =
    kind === 'image'
      ? ImageIcon
      : kind === 'video'
        ? VideoIcon
        : kind === 'audio'
          ? MusicIcon
          : kind === 'text'
            ? FileCodeIcon
            : kind === 'document'
              ? FileTextIcon
              : kind === 'archive'
                ? FileArchiveIcon
                : FileIcon;
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" />;
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function PreviewPanel({
  projectId,
  entry,
  onReveal,
  onOpen,
}: {
  projectId: string | null;
  entry: ProjectFileEntry | null;
  onReveal: (entry: ProjectFileEntry) => void;
  onOpen: (entry: ProjectFileEntry) => void;
}) {
  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
        <FileIcon className="size-8 opacity-30" />
        <p>Nothing selected.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3">
        {entry.missing ? (
          <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
            <AlertTriangleIcon className="size-8 text-amber-500" />
            <p>This file is no longer at</p>
            <p className="break-all font-mono text-[10px]">{entry.path}</p>
          </div>
        ) : entry.kind === 'image' && entry.mediaUrl ? (
          <img
            src={entry.mediaUrl}
            alt={entry.name}
            className="max-h-full max-w-full rounded-md object-contain"
          />
        ) : entry.kind === 'video' && entry.mediaUrl ? (
          // Project media has no caption track to attach; captions are an
          // authoring concern, not a preview one.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            key={entry.id}
            src={entry.mediaUrl}
            controls
            className="max-h-full max-w-full rounded-md"
          />
        ) : entry.kind === 'audio' && entry.mediaUrl ? (
          <div className="w-full space-y-3 px-2">
            <div className="flex justify-center">
              <MusicIcon className="size-10 text-muted-foreground/40" />
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              key={entry.id}
              src={entry.mediaUrl}
              controls
              className="w-full"
            />
          </div>
        ) : entry.kind === 'text' && projectId ? (
          <TextPreview projectId={projectId} entry={entry} />
        ) : entry.mimeType === 'application/pdf' && entry.mediaUrl ? (
          <iframe
            key={entry.id}
            src={entry.mediaUrl}
            title={entry.name}
            className="h-full w-full rounded-md border"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center text-xs text-muted-foreground">
            <FileKindIcon kind={entry.kind} />
            <p>No in-app preview for this type.</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void onOpen(entry)}
            >
              <ExternalLinkIcon className="size-3" />
              Open
            </Button>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t p-3">
        <div className="flex items-start gap-2">
          <FileKindIcon kind={entry.kind} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium" title={entry.name}>
              {entry.name}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {formatFileSize(entry.sizeBytes)}
              {entry.mtimeMs
                ? ` · ${new Date(entry.mtimeMs).toLocaleDateString()}`
                : ''}
              {` · ${PROJECT_FILE_SOURCE_LABELS[entry.primarySource]}`}
            </p>
          </div>
        </div>

        <p className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground">
          {entry.path}
        </p>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => void onReveal(entry)}
          >
            <FolderIcon className="size-3" />
            Reveal
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => void onOpen(entry)}
          >
            <ExternalLinkIcon className="size-3" />
            Open
          </Button>
        </div>
      </div>
    </div>
  );
}

function TextPreview({
  projectId,
  entry,
}: {
  projectId: string;
  entry: ProjectFileEntry;
}) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; result: ProjectFileTextResult }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void window.electron.ipc
      .invoke<ProjectFileTextResult>('project-files:read-text', {
        projectId,
        fileId: entry.id,
      })
      .then((result) => {
        if (!cancelled) setState({ status: 'ready', result });
        return undefined;
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, entry.id]);

  if (state.status === 'loading') {
    return (
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
    );
  }
  if (state.status === 'error') {
    return (
      <p className="p-4 text-center text-xs text-muted-foreground">
        {state.message}
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-background/60 p-3 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
        {state.result.text}
      </pre>
      {state.result.truncated && (
        <p className="pt-1 text-[10px] text-muted-foreground">
          Preview truncated — open the file for the rest.
        </p>
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  hasProject,
  hasRoots,
  filtered,
}: {
  hasProject: boolean;
  hasRoots: boolean;
  filtered: boolean;
}) {
  const message = !hasProject
    ? 'Choose a project to browse its files.'
    : filtered
      ? 'No files match this view.'
      : hasRoots
        ? 'This project has no files yet.'
        : 'This project has no folders yet. Set a repo folder or link a code project.';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
      <FolderSearchIcon className="size-8 opacity-30" />
      <p className="max-w-[240px] leading-relaxed">{message}</p>
    </div>
  );
}
