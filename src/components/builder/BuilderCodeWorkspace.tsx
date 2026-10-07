/**
 * components/builder/BuilderCodeWorkspace.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Code explorer: searchable file tree + read-only editor that fetches file
 * content from the active Builder workspace via `builder:workspace-file-read`.
 *
 * FILE CONTENT IS FETCHED ON DEMAND
 * ──────────────────────────────────
 * Selecting a file triggers an IPC call to read its content from the worktree
 * (or the repo root when worktree isolation is not available). The result is
 * held locally — no global state, because the content is only meaningful while
 * this surface is visible and this session is active.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BracesIcon,
  ChevronRightIcon,
  FileCode2Icon,
  FileIcon,
  FileJson2Icon,
  FilePlus2Icon,
  FileTextIcon,
  FolderClosedIcon,
  FolderOpenIcon,
  Loader2Icon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from '@/components/ai-elements/file-tree';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { BuilderFile, BuilderFileNode } from '@/lib/builder-workspace';

interface BuilderCodeWorkspaceProps {
  files?: BuilderFileNode[];
  selectedPath?: string;
  onSelectFile?: (path: string) => void;
  loading?: boolean;
}

export function BuilderCodeWorkspace({
  files = [],
  selectedPath,
  onSelectFile,
  loading = false,
}: BuilderCodeWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [internalSelectedPath, setInternalSelectedPath] = useState('');
  const activePath = selectedPath ?? internalSelectedPath;
  const visibleFiles = useMemo(
    () => filterFileTree(files, query),
    [files, query],
  );
  const selectedFile = findFile(files, activePath);
  const totalFiles = countFiles(files);

  // ── File content fetch ────────────────────────────────────────────────────
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLanguage, setFileLanguage] = useState<string | undefined>(
    undefined,
  );
  const [fileTruncated, setFileTruncated] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  // Track the path the current fetch was started for so stale responses are
  // ignored when the user selects a different file mid-flight.
  const fetchingPathRef = useRef<string>('');

  useEffect(() => {
    if (!activePath) {
      setFileContent(null);
      setFileLanguage(undefined);
      setFileTruncated(false);
      setContentError(null);
      return;
    }
    fetchingPathRef.current = activePath;
    setContentLoading(true);
    setContentError(null);
    setFileContent(null);

    void (async () => {
      try {
        const result = await window.electron.ipc.invoke<{
          content: string;
          language?: string;
          truncated: boolean;
        }>('builder:workspace-file-read', { filePath: activePath });
        // Discard if a newer selection overtook us.
        if (fetchingPathRef.current !== activePath) return;
        setFileContent(result.content);
        setFileLanguage(result.language);
        setFileTruncated(result.truncated);
      } catch (error) {
        if (fetchingPathRef.current !== activePath) return;
        setContentError(error instanceof Error ? error.message : String(error));
      } finally {
        if (fetchingPathRef.current === activePath) {
          setContentLoading(false);
        }
      }
    })();
  }, [activePath]);

  const selectFile = (path: string) => {
    setInternalSelectedPath(path);
    onSelectFile?.(path);
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background">
      <aside className="flex w-[min(34%,248px)] min-w-[168px] shrink-0 flex-col border-r border-border/60 bg-card/25 sm:w-[min(31%,280px)]">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/50 px-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Files
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] tabular-nums text-muted-foreground">
              {loading ? '—' : totalFiles}
            </span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-6"
            aria-label="Add file"
            disabled
            title="File creation will be available when a workspace is connected."
          >
            <FilePlus2Icon />
          </Button>
        </div>

        <div className="p-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/70" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter files"
              aria-label="Filter workspace files"
              className="h-7 border-border/50 bg-background/70 pl-7 pr-7 text-[10px] shadow-none focus-visible:ring-1"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear file filter"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-1.5 pb-2">
          {loading ? (
            <div className="space-y-2 px-2 py-3" aria-label="Loading files">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-5 animate-pulse rounded bg-muted/60"
                  style={{ width: `${88 - item * 9}%` }}
                />
              ))}
            </div>
          ) : visibleFiles.length > 0 ? (
            <FileTree
              defaultExpanded={new Set(['src'])}
              selectedPath={activePath}
              onSelect={selectFile}
              className="border-0 bg-transparent px-0 py-1 text-[11px]"
            >
              {visibleFiles.map((node) => (
                <FileNodeView key={node.path} node={node} />
              ))}
            </FileTree>
          ) : (
            <div className="flex flex-col items-center px-3 py-8 text-center">
              <div className="mb-2 flex size-8 items-center justify-center rounded-lg border border-border/50 bg-background/70 text-muted-foreground">
                {query ? (
                  <SearchIcon className="size-3.5" />
                ) : (
                  <FolderClosedIcon className="size-3.5" />
                )}
              </div>
              <p className="text-[10px] font-medium">
                {query ? 'No matching files' : 'Workspace is empty'}
              </p>
              <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                {query
                  ? 'Try a shorter name or path.'
                  : 'Project files will appear here when a build workspace is ready.'}
              </p>
            </div>
          )}
        </div>
        <div className="flex h-7 shrink-0 items-center gap-1.5 border-t border-border/50 px-2.5 text-[9px] text-muted-foreground">
          <FolderOpenIcon className="size-3 text-primary/70" />
          <span className="truncate font-mono">workspace</span>
        </div>
      </aside>

      <section
        className="flex min-w-0 flex-1 flex-col"
        aria-label="Code editor"
      >
        <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
            {selectedFile ? (
              <>
                <span className="truncate font-mono text-foreground/85">
                  {selectedFile.path}
                </span>
                {selectedFile.change && (
                  <ChangeBadge kind={selectedFile.change} />
                )}
              </>
            ) : (
              <>
                <BracesIcon className="size-3.5" />
                <span>Editor</span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {contentLoading && (
              <Loader2Icon className="size-3 animate-spin text-muted-foreground/50" />
            )}
            <Badge
              variant="outline"
              className="h-4 px-1.5 text-[8px] font-normal text-muted-foreground"
            >
              {fileLanguage ?? selectedFile?.language ?? 'read only'}
            </Badge>
            {fileTruncated && (
              <Badge
                variant="outline"
                className="h-4 px-1.5 text-[8px] font-normal text-amber-600 dark:text-amber-400"
              >
                truncated
              </Badge>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-6"
              aria-label="Editor options"
              disabled
            >
              <ChevronRightIcon className="size-3.5 rotate-90" />
            </Button>
          </div>
        </div>

        {contentError ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
            <p className="max-w-xs text-[10px] leading-relaxed text-destructive">
              {contentError}
            </p>
          </div>
        ) : contentLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <Loader2Icon className="size-5 animate-spin text-muted-foreground/40" />
          </div>
        ) : selectedFile && fileContent !== null ? (
          <CodeDocument content={fileContent} path={selectedFile.path} />
        ) : selectedFile ? (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center">
            <p className="text-[10px] text-muted-foreground">
              Loading file contents&hellip;
            </p>
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background px-6 py-10">
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(var(--border)_0.65px,transparent_0.65px)] [background-size:15px_15px]" />
            <div className="relative flex max-w-xs flex-col items-center text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-border/60 bg-card text-muted-foreground shadow-sm">
                <FileCode2Icon className="size-5" />
              </div>
              <p className="text-xs font-medium">
                {totalFiles > 0
                  ? 'Choose a file to inspect'
                  : 'Nothing to inspect yet'}
              </p>
              <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                {totalFiles > 0
                  ? 'Select a file from the explorer to see its current contents.'
                  : 'When the workspace is created, source files will be available here for review.'}
              </p>
              {totalFiles === 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-[9px] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                  No generated files yet
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex h-7 shrink-0 items-center justify-between border-t border-border/50 bg-card/20 px-3 text-[9px] text-muted-foreground/75">
          <span>
            {fileContent !== null
              ? (fileLanguage ?? 'Plain text')
              : 'No file selected'}
          </span>
          <span className="font-mono">UTF-8</span>
        </div>
      </section>
    </div>
  );
}

function FileNodeView({ node }: { node: BuilderFileNode }) {
  if (node.kind === 'file') {
    return (
      <FileTreeFile
        path={node.path}
        name={node.name}
        icon={<FileTypeIcon file={node} />}
        className="text-[10px]"
      />
    );
  }

  return (
    <FileTreeFolder path={node.path} name={node.name} className="text-[10px]">
      {node.children.map((child) => (
        <FileNodeView key={child.path} node={child} />
      ))}
    </FileTreeFolder>
  );
}

function FileTypeIcon({ file }: { file: BuilderFile }) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const className = cn(
    'size-3.5',
    file.change === 'added'
      ? 'text-emerald-500'
      : file.change === 'modified'
        ? 'text-amber-500'
        : file.change === 'deleted'
          ? 'text-destructive'
          : 'text-muted-foreground/75',
  );
  if (extension === 'json') return <FileJson2Icon className={className} />;
  if (['tsx', 'ts', 'jsx', 'js', 'css', 'html'].includes(extension ?? '')) {
    return <FileCode2Icon className={className} />;
  }
  if (['md', 'mdx', 'txt'].includes(extension ?? '')) {
    return <FileTextIcon className={className} />;
  }
  return <FileIcon className={className} />;
}

function CodeDocument({ content, path }: { content: string; path: string }) {
  const lines = content.split('\n');
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-background py-3 font-mono text-[10px] leading-5">
      <pre className="min-w-max">
        {lines.map((line, index) => (
          <span key={`${path}:${index}`} className="flex min-h-5">
            <span className="sticky left-0 w-10 shrink-0 select-none bg-background pr-3 text-right text-muted-foreground/40">
              {index + 1}
            </span>
            <code className="whitespace-pre pr-6 text-foreground/85">
              {line || ' '}
            </code>
          </span>
        ))}
      </pre>
    </div>
  );
}

function ChangeBadge({ kind }: { kind: NonNullable<BuilderFile['change']> }) {
  const label = kind === 'added' ? 'A' : kind === 'deleted' ? 'D' : 'M';
  return (
    <span
      className={cn(
        'flex size-4 items-center justify-center rounded text-[8px] font-semibold',
        kind === 'added'
          ? 'bg-emerald-500/10 text-emerald-600'
          : kind === 'deleted'
            ? 'bg-destructive/10 text-destructive'
            : 'bg-amber-500/10 text-amber-600',
      )}
    >
      {label}
    </span>
  );
}

function filterFileTree(
  nodes: BuilderFileNode[],
  query: string,
): BuilderFileNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;
  const filtered: BuilderFileNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'file') {
      if (`${node.path} ${node.name}`.toLowerCase().includes(normalized)) {
        filtered.push(node);
      }
      continue;
    }
    const children = filterFileTree(node.children, normalized);
    if (
      `${node.path} ${node.name}`.toLowerCase().includes(normalized) ||
      children.length
    ) {
      filtered.push({ ...node, children });
    }
  }
  return filtered;
}

function findFile(
  nodes: BuilderFileNode[],
  path: string,
): BuilderFile | undefined {
  for (const node of nodes) {
    if (node.path === path && node.kind === 'file') return node;
    if (node.kind === 'directory') {
      const file = findFile(node.children, path);
      if (file) return file;
    }
  }
  return undefined;
}

function countFiles(nodes: BuilderFileNode[]): number {
  return nodes.reduce(
    (total, node) =>
      total + (node.kind === 'file' ? 1 : countFiles(node.children)),
    0,
  );
}
