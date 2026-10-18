/**
 * components/builder/BuilderCodebasePicker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The codebase chooser that sits in the Builder welcome composer, immediately
 * before Submit.
 *
 * WHY A MENU AND NOT A PANEL
 * The previous shape put "Codebase for this build" in its own bordered panel
 * below the composer. That read as a *setup step to finish first*, when the
 * codebase is in fact a parameter of the send you are about to make — the same
 * way the model selector qualifies a Builder turn. Putting it in the footer
 * keeps one control next to the action it constrains, and lets the welcome view
 * drop a whole panel.
 *
 * IT LAUNCHES, IT DOES NOT SELECT
 * Every entry binds a session immediately (that is what `onOpenCodeProject` and
 * `onChooseWorkspace` do), so the trigger deliberately does not read as a
 * "current selection". It says which codebase is *suggested* and the menu
 * offers the ways to change it. Inventing a pending-selection state that the
 * main process does not honour would be a control that lies about the workspace.
 *
 * The details that do not fit in a menu — a folder name and a clone URL — open
 * in a dialog instead of being typed into a submenu, which keeps the menu
 * scannable and gives the inputs real labels and focus handling.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  DatabaseIcon,
  FolderGit2Icon,
  FolderPlusIcon,
  GitBranchIcon,
  Loader2Icon,
  TerminalIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { CodeProject } from '@/main/ipc/channels';

type ProvisionMode = 'created' | 'clone';

interface BuilderCodebasePickerProps {
  canChoose: boolean;
  projectName: string | null;
  projectRepoPath: string | null;
  projectId: string | null;
  codeProjects: CodeProject[];
  codeProjectsLoading: boolean;
  codeProjectsBusy: boolean;
  indexingId: string | null;
  onChooseWorkspace: (defaultPath?: string | null) => void;
  onLinkExistingCodeProject: (defaultPath?: string | null) => void;
  onOpenCodeProject: (codeProject: CodeProject) => void;
  onOpenTerminal: (codeProject: CodeProject) => void;
  onProvisionCodeProject: (input: {
    name: string;
    source: ProvisionMode;
    remoteUrl?: string;
  }) => void;
  onIndexCodeProject: (codeProjectId: string) => void;
}

export function BuilderCodebasePicker({
  canChoose,
  projectName,
  projectRepoPath,
  projectId,
  codeProjects,
  codeProjectsLoading,
  codeProjectsBusy,
  indexingId,
  onChooseWorkspace,
  onLinkExistingCodeProject,
  onOpenCodeProject,
  onOpenTerminal,
  onProvisionCodeProject,
  onIndexCodeProject,
}: BuilderCodebasePickerProps) {
  const [dialogMode, setDialogMode] = useState<ProvisionMode | null>(null);
  const [name, setName] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');

  const openDialog = (mode: ProvisionMode) => {
    setName('');
    setRemoteUrl('');
    setDialogMode(mode);
  };

  const triggerLabel = projectRepoPath
    ? projectName || 'Project repo'
    : 'Choose codebase';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={!canChoose && !codeProjectsBusy}
            className="h-7 min-w-0 max-w-[190px] gap-1.5 px-2 text-xs font-normal"
            title="Pick the codebase Builder should build in"
          >
            {canChoose ? (
              <FolderGit2Icon className="size-3.5 shrink-0 text-primary" />
            ) : (
              <Loader2Icon className="size-3.5 shrink-0 animate-spin" />
            )}
            <span className="truncate">{triggerLabel}</span>
            <ChevronDownIcon className="size-3 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Codebase for this build</DropdownMenuLabel>

          {projectRepoPath && (
            <DropdownMenuItem
              onSelect={() => onChooseWorkspace(projectRepoPath)}
              className="flex-col items-start gap-0.5 py-2"
            >
              <span className="flex w-full items-center gap-2">
                <FolderGit2Icon className="size-3.5 shrink-0 text-primary" />
                <span className="truncate font-medium">
                  {projectName || 'Use Project repo'}
                </span>
                <CheckIcon className="ml-auto size-3.5 shrink-0 text-primary" />
              </span>
              <span className="w-full truncate pl-5.5 font-mono text-xs text-muted-foreground">
                {projectRepoPath}
              </span>
            </DropdownMenuItem>
          )}

          {projectId && (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderGit2Icon className="size-3.5" />
                  <span>Codebases in this Project</span>
                  {codeProjectsLoading && (
                    <Loader2Icon className="ml-auto size-3 animate-spin" />
                  )}
                  {!codeProjectsLoading && codeProjects.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {codeProjects.length}
                    </span>
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  {codeProjects.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      {codeProjectsLoading
                        ? 'Loading…'
                        : 'No codebases linked yet.'}
                    </p>
                  ) : (
                    codeProjects.map((codeProject) => (
                      <DropdownMenuSub key={codeProject.id}>
                        <DropdownMenuSubTrigger className="flex-col items-start gap-0.5 py-1.5 data-[state=open]:bg-transparent">
                          <span className="flex w-full items-center gap-2">
                            <span className="truncate font-medium">
                              {codeProject.name}
                            </span>
                            <IndexBadge codeProject={codeProject} />
                          </span>
                          <span className="w-full truncate pl-5.5 font-mono text-xs text-muted-foreground">
                            {codeProject.directory}
                          </span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-60">
                          <DropdownMenuItem
                            onSelect={() => onOpenCodeProject(codeProject)}
                          >
                            <FolderGit2Icon className="size-3.5" />
                            Build in this codebase
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => onOpenTerminal(codeProject)}
                          >
                            <TerminalIcon className="size-3.5" />
                            Open in Terminal
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={indexingId !== null || codeProjectsBusy}
                            onSelect={() => onIndexCodeProject(codeProject.id)}
                          >
                            {indexingId === codeProject.id ? (
                              <Loader2Icon className="size-3.5 animate-spin" />
                            ) : (
                              <DatabaseIcon className="size-3.5" />
                            )}
                            {codeProject.index_status === 'ready'
                              ? `Re-index · ${codeProject.indexed_files} files`
                              : 'Index source for search'}
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuItem onSelect={() => onLinkExistingCodeProject()}>
                <FolderGit2Icon className="size-3.5" />
                Link an existing repository…
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => onChooseWorkspace(null)}>
            <FolderGit2Icon className="size-3.5" />
            Choose a folder…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openDialog('created')}>
            <FolderPlusIcon className="size-3.5" />
            New project…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openDialog('clone')}>
            <GitBranchIcon className="size-3.5" />
            Clone a repository…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProvisionDialog
        mode={dialogMode}
        busy={codeProjectsBusy}
        name={name}
        remoteUrl={remoteUrl}
        onNameChange={setName}
        onRemoteUrlChange={setRemoteUrl}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null);
        }}
        onSubmit={(submittedName) => {
          setDialogMode(null);
          onProvisionCodeProject({
            name: submittedName,
            source: dialogMode === 'clone' ? 'clone' : 'created',
            ...(dialogMode === 'clone' ? { remoteUrl: remoteUrl.trim() } : {}),
          });
        }}
      />
    </>
  );
}

function IndexBadge({ codeProject }: { codeProject: CodeProject }) {
  if (codeProject.index_status === 'ready') {
    return (
      <span className="ml-auto shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400">
        indexed {codeProject.indexed_files}
      </span>
    );
  }
  if (codeProject.index_status === 'error') {
    return (
      <span className="ml-auto shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
        index failed
      </span>
    );
  }
  return null;
}

function ProvisionDialog({
  mode,
  busy,
  name,
  remoteUrl,
  onNameChange,
  onRemoteUrlChange,
  onOpenChange,
  onSubmit,
}: {
  mode: ProvisionMode | null;
  busy: boolean;
  name: string;
  remoteUrl: string;
  onNameChange: (value: string) => void;
  onRemoteUrlChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => void;
}) {
  const cloning = mode === 'clone';
  const canSubmit =
    !busy &&
    name.trim().length > 0 &&
    (!cloning || remoteUrl.trim().length > 0);

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {cloning ? 'Clone a repository' : 'Create a new project'}
          </DialogTitle>
          <DialogDescription>
            {cloning
              ? 'Builder clones into a staging folder and moves it into place only once it succeeds.'
              : 'Builder creates the folder and initializes Git with an initial commit.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label
              htmlFor="builder-codebase-name"
              className="text-xs font-medium"
            >
              Folder name
            </label>
            <Input
              id="builder-codebase-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="my-app"
              autoComplete="off"
            />
          </div>

          {cloning && (
            <div className="space-y-1.5">
              <label
                htmlFor="builder-codebase-remote"
                className="text-xs font-medium"
              >
                HTTPS or SSH Git URL
              </label>
              <Input
                id="builder-codebase-remote"
                value={remoteUrl}
                onChange={(event) => onRemoteUrlChange(event.target.value)}
                placeholder="https://github.com/org/repo.git"
                autoComplete="url"
              />
              <p className="text-xs text-muted-foreground">
                Embedded credentials are rejected. Private repositories use your
                existing SSH agent or credential helper.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={() => onSubmit(name.trim())}>
            {cloning ? 'Clone…' : 'Create…'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
