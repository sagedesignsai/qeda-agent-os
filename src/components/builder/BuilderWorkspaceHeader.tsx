/**
 * components/builder/BuilderWorkspaceHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Builder workspace chrome: repository identity, runtime state, and the folder
 * picker that binds a session. The bound directory is shown explicitly so a run
 * never happens in a folder the user did not choose.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  AlertTriangleIcon,
  FolderGit2Icon,
  GitBranchIcon,
  MoreHorizontalIcon,
  SparklesIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { BuilderConnectionStatus } from '@/lib/builder-types';
import type { BuilderWorkspace } from '@/lib/builder-workspace';

interface BuilderWorkspaceHeaderProps {
  status: BuilderConnectionStatus | null;
  loading: boolean;
  workspace?: BuilderWorkspace | null;
  selecting?: boolean;
  onSelectWorkspace?: () => void;
}

export function BuilderWorkspaceHeader({
  status,
  loading,
  workspace = null,
  selecting = false,
  onSelectWorkspace,
}: BuilderWorkspaceHeaderProps) {
  const connected = status?.state === 'connected';

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SparklesIcon className="size-3.5" />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-xs font-semibold tracking-tight">
            {workspace?.name ?? 'No workspace'}
          </span>
        </div>
        {workspace && (
          <>
            <Separator
              orientation="vertical"
              className="mx-1 hidden h-4 sm:block"
            />
            <Badge
              variant="outline"
              className="hidden h-5 max-w-[220px] gap-1 border-border/70 px-1.5 text-[10px] font-normal text-muted-foreground sm:inline-flex"
            >
              <GitBranchIcon className="size-3 shrink-0" />
              <span className="truncate">
                {workspace.branch ?? 'detached HEAD'}
              </span>
            </Badge>
            {workspace.dirty && (
              <Badge
                variant="outline"
                className="hidden h-5 gap-1 border-amber-500/30 bg-amber-500/5 px-1.5 text-[10px] font-normal text-amber-600 dark:text-amber-400 sm:inline-flex"
              >
                <AlertTriangleIcon className="size-3" />
                {workspace.changedFileCount} uncommitted
              </Badge>
            )}
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="hidden items-center gap-1.5 pr-1 text-[10px] text-muted-foreground sm:flex">
          <span
            className={`size-1.5 rounded-full ${loading ? 'animate-pulse bg-amber-400' : connected ? 'bg-emerald-400' : 'bg-muted-foreground/50'}`}
          />
          <span>
            {loading
              ? 'Checking runtime'
              : connected
                ? 'OpenCode reachable'
                : status?.state === 'unsupported'
                  ? 'Version unsupported'
                  : status?.state === 'error'
                    ? 'Connection error'
                    : 'OpenCode not running'}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2.5 text-[11px]"
          onClick={onSelectWorkspace}
          disabled={selecting || !onSelectWorkspace}
          title={
            workspace
              ? 'Choose a different project folder.'
              : 'Choose the git repository Builder should work in.'
          }
        >
          {selecting ? (
            <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
          ) : (
            <FolderGit2Icon className="size-3" />
          )}
          <span className="hidden xs:inline">
            {workspace ? 'Switch folder' : 'Choose folder'}
          </span>
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="More build options"
          disabled
        >
          <MoreHorizontalIcon />
        </Button>
      </div>
    </header>
  );
}
