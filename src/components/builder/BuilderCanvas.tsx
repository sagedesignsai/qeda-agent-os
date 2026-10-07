/**
 * components/builder/BuilderCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Preview, code, and change surfaces for one Builder workspace.
 *
 * THE PREVIEW IS EITHER QEDA'S OR THE AGENT'S — AND IT SAYS WHICH
 * ─────────────────────────────────────────────────────────────
 * Two things can put a URL in this canvas: a process Qeda started (`owner:
 * 'qeda'`, with a real Stop control because we can actually kill it) or a server
 * the agent started inside a turn and advertised in its output (`owner:
 * 'detected'`, read-only — offering Stop there would be a button that lies).
 * The badge, the address bar, and the footer all distinguish the two.
 *
 * WHEN THERE IS NO URL IT SAYS SO PLAINLY
 * ──────────────────────────────────────
 * `starting`, `error`, and `exited` each get their own copy, the command that
 * was run, and the tail of the process log — because "Preview not started" and
 * "we tried and your dev script failed" must never look the same.
 *
 * FRAMING IS THE PROJECT'S CALL, NOT OURS
 * ──────────────────────────────────────
 * Plenty of dev servers send `X-Frame-Options: DENY` or a `frame-ancestors`
 * policy and will simply refuse to render in an iframe. We do not pretend to
 * detect that (an iframe gives no reliable signal); the address is always
 * accompanied by a working "open in your browser" control, which is the honest
 * escape hatch for a server that will not be framed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  ArrowDownToLineIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CircleDotDashedIcon,
  Code2Icon,
  ExternalLinkIcon,
  GitCompareArrowsIcon,
  Globe2Icon,
  Loader2Icon,
  MonitorIcon,
  MoreHorizontalIcon,
  PanelRightCloseIcon,
  PlayIcon,
  RefreshCwIcon,
  SmartphoneIcon,
  SquareIcon,
  TabletIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BuilderCodeWorkspace } from '@/components/builder/BuilderCodeWorkspace';
import { BuilderChangesWorkspace } from '@/components/builder/BuilderChangesWorkspace';
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from '@/components/ai-elements/web-preview';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  BuilderSurface,
  BuilderViewport,
} from '@/hooks/use-builder-workspace';
import type {
  BuilderPreviewOwner,
  BuilderPreviewStatus,
} from '@/lib/builder-preview';
import type {
  BuilderFileChange,
  BuilderFileNode,
} from '@/lib/builder-workspace';

interface BuilderCanvasProps {
  surface: BuilderSurface;
  viewport: BuilderViewport;
  onSurfaceChange: (surface: BuilderSurface) => void;
  onViewportChange: (viewport: BuilderViewport) => void;
  /** The address to load — Qeda's own process first, else a detected one. */
  previewUrl: string;
  /** Who owns the process behind that address, or null when there is none. */
  previewOwner: BuilderPreviewOwner | null;
  /** Full status, so the no-URL states can explain themselves. */
  previewStatus: BuilderPreviewStatus;
  previewStarting?: boolean;
  previewStopping?: boolean;
  /** True when a session is bound, so a preview *can* be started. */
  canStartPreview?: boolean;
  onStartPreview?: () => void;
  onStopPreview?: () => void;
  onOpenExternal?: (url: string) => void;
  files?: BuilderFileNode[];
  changes?: BuilderFileChange[];
  selectedFilePath?: string;
  onSelectFile?: (path: string) => void;
}

const VIEWPORTS: Array<{
  id: BuilderViewport;
  label: string;
  icon: typeof MonitorIcon;
}> = [
  { id: 'desktop', label: 'Desktop preview', icon: MonitorIcon },
  { id: 'tablet', label: 'Tablet preview', icon: TabletIcon },
  { id: 'mobile', label: 'Mobile preview', icon: SmartphoneIcon },
];

const IDLE_BADGE: Record<
  BuilderPreviewStatus['state'],
  { label: string; className: string; dot: string }
> = {
  idle: {
    label: 'Preview not started',
    className: 'text-muted-foreground',
    dot: 'bg-muted-foreground/40',
  },
  starting: {
    label: 'Starting preview',
    className: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-400 animate-pulse',
  },
  ready: {
    label: 'Preview running',
    className: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-400',
  },
  exited: {
    label: 'Preview stopped',
    className: 'text-muted-foreground',
    dot: 'bg-muted-foreground/40',
  },
  error: {
    label: 'Preview failed',
    className: 'text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-400',
  },
};

/**
 * The no-URL state. Splitting it out keeps the canvas readable and lets each
 * failure mode own its own words instead of collapsing into one grey box.
 */
function PreviewIdleState({
  status,
  owner,
  canStart,
  starting,
  stopping,
  onStart,
  onStop,
}: {
  status: BuilderPreviewStatus;
  owner: BuilderPreviewOwner | null;
  canStart: boolean;
  starting: boolean;
  stopping: boolean;
  onStart?: () => void;
  onStop?: () => void;
}) {
  const badge = IDLE_BADGE[status.state];
  const ownsProcess = owner === 'qeda';
  const canStop =
    ownsProcess &&
    (status.state === 'starting' || status.state === 'ready') &&
    Boolean(onStop);

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
      <div className="relative mb-5 flex size-16 items-center justify-center rounded-[22px] border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-accent/50 shadow-lg shadow-primary/5">
        <div className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-background bg-primary text-primary-foreground shadow-sm">
          <WandSparklesIcon className="size-2.5" />
        </div>
        <Globe2Icon className="size-7 text-primary/70" />
      </div>

      <Badge
        variant="outline"
        className={`mb-3 gap-1.5 border-border/70 bg-background/70 text-[9px] font-normal ${badge.className}`}
      >
        {status.state === 'starting' ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : status.state === 'error' ? (
          <TriangleAlertIcon className="size-3" />
        ) : (
          <span className={`size-1.5 rounded-full ${badge.dot}`} />
        )}
        {badge.label}
      </Badge>

      <h2 className="max-w-sm text-base font-semibold tracking-tight sm:text-lg">
        {status.state === 'error'
          ? 'The preview did not start.'
          : status.state === 'starting'
            ? 'Starting your dev server…'
            : 'Your next idea will live here.'}
      </h2>

      <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
        {status.message ??
          'Once a build is running, this canvas becomes an interactive preview. Resize it for desktop, tablet, and mobile as you shape the details.'}
      </p>

      {status.command && (
        <div className="mt-4 flex max-w-md items-center gap-2 rounded-full border border-border/60 bg-background/75 px-3 py-1.5 text-[9px] text-muted-foreground shadow-sm">
          <span className={`size-1.5 shrink-0 rounded-full ${badge.dot}`} />
          <span className="truncate font-mono">{status.command}</span>
        </div>
      )}

      {status.log.length > 0 && (
        <pre className="mt-4 max-h-40 w-full max-w-md overflow-auto rounded-lg border border-border/60 bg-muted/40 p-2.5 text-left font-mono text-[10px] leading-snug whitespace-pre-wrap text-muted-foreground">
          {status.log.slice(-12).join('\n')}
        </pre>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {canStop ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={onStop}
            disabled={stopping}
          >
            <SquareIcon className="size-3" />
            {stopping ? 'Stopping…' : 'Stop preview'}
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onStart}
            disabled={!canStart || starting}
            title={
              canStart
                ? 'Run this project’s dev script and load it here.'
                : 'Choose a project folder first.'
            }
          >
            <PlayIcon className="size-3" />
            {starting
              ? 'Starting…'
              : status.state === 'error' || status.state === 'exited'
                ? 'Try again'
                : 'Start preview'}
          </Button>
        )}
      </div>

      {!canStart && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Choose a project folder first.
        </p>
      )}

      <div className="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-1.5 text-[9px] text-muted-foreground/60 sm:flex">
        <CheckIcon className="size-3" />
        Preview opens here when ready
      </div>
    </div>
  );
}

export function BuilderCanvas({
  surface,
  viewport,
  onSurfaceChange,
  onViewportChange,
  previewUrl,
  previewOwner,
  previewStatus,
  previewStarting = false,
  previewStopping = false,
  canStartPreview = false,
  onStartPreview,
  onStopPreview,
  onOpenExternal,
  files = [],
  changes = [],
  selectedFilePath,
  onSelectFile,
}: BuilderCanvasProps) {
  // Remounting the frame is the only honest "reload" an iframe gives us without
  // reaching into the server: a new key is a new document load.
  const [reloadNonce, setReloadNonce] = useState(0);

  const widthClass = {
    desktop: 'w-full',
    tablet: 'w-[min(100%,768px)]',
    mobile: 'w-[min(100%,390px)]',
  }[viewport];

  const ownsProcess = previewOwner === 'qeda';
  const badge = IDLE_BADGE[previewStatus.state];
  const running = ownsProcess && previewStatus.state === 'ready';

  const footerStatus = running
    ? `Preview running · ${previewUrl}`
    : previewStatus.state === 'starting'
      ? 'Preview starting…'
      : previewOwner === 'detected'
        ? 'Preview detected in agent output'
        : previewStatus.state === 'error'
          ? 'Preview failed to start'
          : previewStatus.state === 'exited'
            ? 'Preview stopped'
            : 'No project process running';

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-muted/20"
      aria-label="Build canvas"
    >
      <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-1 border-b border-border/50 bg-background/75 px-2.5 sm:px-3">
        <Tabs
          value={surface}
          onValueChange={(value) => onSurfaceChange(value as BuilderSurface)}
          className="min-w-0"
        >
          <TabsList variant="line" className="h-9 gap-1 p-0">
            <TabsTrigger
              value="preview"
              className="h-8 flex-none gap-1.5 px-2 text-[11px]"
            >
              <Globe2Icon className="size-3.5" /> Preview
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="h-8 flex-none gap-1.5 px-2 text-[11px]"
            >
              <Code2Icon className="size-3.5" /> Code
            </TabsTrigger>
            <TabsTrigger
              value="changes"
              className="h-8 flex-none gap-1.5 px-2 text-[11px]"
            >
              <GitCompareArrowsIcon className="size-3.5" />
              <span className="hidden xs:inline">Changes</span>
              <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">
                {changes.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1">
          {surface === 'preview' && (
            <div className="mr-1 flex items-center rounded-lg border border-border/60 bg-card/70 p-0.5">
              {VIEWPORTS.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  size="icon-sm"
                  variant={viewport === id ? 'secondary' : 'ghost'}
                  className="size-6 rounded-md"
                  aria-label={label}
                  aria-pressed={viewport === id}
                  onClick={() => onViewportChange(id)}
                >
                  <Icon className="size-3.5" />
                </Button>
              ))}
            </div>
          )}
          {surface === 'preview' && ownsProcess && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={onStopPreview}
              disabled={previewStopping}
            >
              <SquareIcon className="size-3" />
              {previewStopping ? 'Stopping…' : 'Stop'}
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Canvas options"
            disabled
          >
            <MoreHorizontalIcon />
          </Button>
        </div>
      </div>

      {surface === 'preview' ? (
        <div className="flex min-h-0 flex-1 flex-col p-2.5 sm:p-4">
          <WebPreview
            // The URL arrives asynchronously, and WebPreview seeds its own state
            // once — so a new address (or a reload) remounts the shell.
            key={`${previewUrl}#${reloadNonce}`}
            defaultUrl={previewUrl}
            className="min-h-0 flex-1 overflow-hidden rounded-xl border-border/70 bg-background shadow-xl shadow-black/5"
          >
            <WebPreviewNavigation className="min-h-10 gap-1 border-b border-border/50 bg-card/70 px-2 py-1.5">
              {/* Back/Forward stay disabled: an iframe gives us no history to
                  drive, and a dead button is better than a lying one. */}
              <WebPreviewNavigationButton tooltip="Back" disabled>
                <ArrowLeftIcon className="size-3.5" />
              </WebPreviewNavigationButton>
              <WebPreviewNavigationButton tooltip="Forward" disabled>
                <ArrowRightIcon className="size-3.5" />
              </WebPreviewNavigationButton>
              <WebPreviewNavigationButton
                tooltip="Reload"
                disabled={!previewUrl}
                onClick={() => setReloadNonce((nonce) => nonce + 1)}
              >
                <RefreshCwIcon className="size-3.5" />
              </WebPreviewNavigationButton>
              <div className="mx-1 flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border/50 bg-background px-2">
                {previewUrl && previewStatus.state === 'ready' ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                ) : (
                  <span className={`size-1.5 shrink-0 rounded-full ${badge.dot}`} />
                )}
                <WebPreviewUrl
                  value={previewUrl}
                  readOnly
                  disabled
                  aria-label="Local preview address"
                  placeholder="Preview will appear here"
                  className="h-7 border-0 bg-transparent px-0 font-mono text-[10px] shadow-none focus-visible:ring-0"
                />
              </div>
              {previewUrl && (
                <Badge
                  variant="outline"
                  className="hidden h-6 shrink-0 gap-1 border-border/70 px-1.5 text-[9px] font-normal text-muted-foreground sm:inline-flex"
                >
                  {ownsProcess ? 'Qeda preview' : 'Detected'}
                </Badge>
              )}
              <WebPreviewNavigationButton
                tooltip="Open preview in browser"
                disabled={!previewUrl}
                onClick={() => previewUrl && onOpenExternal?.(previewUrl)}
              >
                <ExternalLinkIcon className="size-3.5" />
              </WebPreviewNavigationButton>
            </WebPreviewNavigation>

            {previewUrl ? (
              <WebPreviewBody />
            ) : (
              <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(ellipse_at_center,var(--color-card)_0%,var(--color-muted)_100%)] p-3 sm:p-6">
                <div
                  className={`relative flex h-full max-h-[860px] min-h-[280px] ${widthClass} flex-col overflow-hidden rounded-xl border border-border/60 bg-background/80 shadow-2xl shadow-black/10 transition-[width] duration-300`}
                >
                  <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:28px_28px]" />
                  <PreviewIdleState
                    status={previewStatus}
                    owner={previewOwner}
                    canStart={canStartPreview}
                    starting={previewStarting}
                    stopping={previewStopping}
                    onStart={onStartPreview}
                    onStop={onStopPreview}
                  />
                </div>
              </div>
            )}
          </WebPreview>
        </div>
      ) : surface === 'code' ? (
        <BuilderCodeWorkspace
          files={files}
          selectedPath={selectedFilePath}
          onSelectFile={onSelectFile}
        />
      ) : (
        <BuilderChangesWorkspace changes={changes} />
      )}

      <div className="flex h-7 shrink-0 items-center justify-between border-t border-border/50 bg-background/70 px-3 text-[9px] text-muted-foreground/80">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={`size-1.5 shrink-0 rounded-full ${badge.dot}`} />
          <span className="truncate">{footerStatus}</span>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="flex items-center gap-1">
            <ArrowDownToLineIcon className="size-3" />
            Review before applying
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-5"
            aria-label="Collapse canvas details"
            disabled
          >
            <PanelRightCloseIcon />
          </Button>
        </div>
      </div>
    </section>
  );
}
