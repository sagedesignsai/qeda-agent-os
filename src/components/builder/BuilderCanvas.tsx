/**
 * components/builder/BuilderCanvas.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Preview, code, and change surfaces for one Builder workspace.
 *
 * NO FOLDER BUTTON HERE
 * ─────────────────────
 * This canvas used to own the folder picker in its identity bar. It does not any
 * more: the picker gates sending a prompt, so it belongs to the conversation and
 * is rendered by BuilderChatPanel beside the Send button. What remains in row 1
 * is identity (left), the surface switch (centre), and the runtime readout
 * (right) — nothing here acts on the workspace, it only describes it.
 *
 * TWO BARS OF CHROME, AND THE SECOND ONE IS OPTIONAL
 * ──────────────────────────────────────────────────
 * The canvas used to stack four strips (identity bar, surface bar, preview URL
 * bar, status footer ≈ 100px) before a single pixel of content. Two survive, and
 * they have different jobs:
 *
 *   row 1 (always)   identity → surface switch → workspace actions
 *   row 2 (preview)  viewport → address → preview actions
 *
 * Viewport presets and the process Stop control used to sit in row 1, where they
 * competed with the folder picker for the same 36px. They belong to the preview
 * they resize and the process they stop, so they live in row 2 with the address
 * they operate on. There is no row 3: the old status footer restated what the
 * idle state and the address dot already say, so it is gone rather than moved.
 *
 * The surface tabs keep their labels. "Preview / Code / Changes" is the primary
 * navigation of this panel and three glyphs (globe, braces, arrows) are not
 * enough to name it; identity truncates instead.
 *
 * THE PREVIEW IS EITHER QEDA'S OR THE AGENT'S — AND IT SAYS WHICH
 * ─────────────────────────────────────────────────────────────────
 * Two things can put a URL in this canvas: a process Qeda started (`owner:
 * 'qeda'`, with a real Stop control because we can actually kill it) or a server
 * the agent started inside a turn and advertised in its output (`owner:
 * 'detected'`, read-only — offering Stop there would be a button that lies).
 * The dot, the owner badge, and the Stop control all distinguish the two.
 *
 * WHEN THERE IS NO URL IT SAYS SO PLAINLY
 * ──────────────────────────────────────
 * `starting`, `error`, and `exited` each get their own heading, the command that
 * was run, and the tail of the process log — because "Preview not started" and
 * "we tried and your dev script failed" must never look the same.
 *
 * THE VIEWPORT PRESET ACTUALLY RESIZES THE PREVIEW
 * ────────────────────────────────────────────────
 * It used to be applied only to the idle placeholder, so picking "mobile" did
 * nothing at all once a real URL was loaded. One frame now hosts both states, so
 * the preset is honest whether the canvas is showing a placeholder or an iframe.
 *
 * THE PREVIEW FILLS THE CANVAS
 * ───────────────────────────
 * The preview is the thing being looked at, so it runs edge-to-edge: no padding
 * around it, no rounded corners, no drop shadow, no height ceiling. Those four
 * things stacked up into a "floating device mock", which misrepresented what the
 * user was seeing — a real dev server, not a phone emulator. They also cost four
 * nested layers before a single pixel of the actual site.
 *
 * Two consequences worth knowing, both intended:
 *   • The tablet/mobile presets still centre (`mx-auto`) and now show their
 *     letterbox against a `bg-muted` wrapper, so the narrower width stays legible
 *     without a fake device bezel to imply it.
 *   • `WebPreview` brings its own `rounded-lg border bg-card` defaults, so
 *     `rounded-none border-0` here is a deliberate override of the component, not
 *     a redundant restatement. Removing those classes would *reveal* the
 *     component's rounding, not remove it.
 *
 * FRAMING IS THE PROJECT'S CALL, NOT OURS
 * ──────────────────────────────────────
 * Plenty of dev servers send `X-Frame-Options: DENY` or a `frame-ancestors`
 * policy and will simply refuse to render in an iframe. We do not pretend to
 * detect that (an iframe gives no reliable signal); the address is always
 * accompanied by a working "open in your browser" control, which is the honest
 * escape hatch for a server that will not be framed.
 *
 * TYPE
 * ────
 * This module uses the two small steps the theme already defines and nothing
 * else: `text-xs` (11px) for chrome — labels, counts, paths, the address — and
 * `text-sm` (12px) for prose. No arbitrary font sizes: the builder used to carry
 * eight of them between 8px and 11px, which is why its meta text was illegible.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  AlertTriangleIcon,
  Code2Icon,
  ExternalLinkIcon,
  GitBranchIcon,
  GitCompareArrowsIcon,
  Globe2Icon,
  Loader2Icon,
  MonitorIcon,
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
import { Separator } from '@/components/ui/separator';
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
  BuilderWorkspace,
} from '@/lib/builder-workspace';
import type { BuilderConnectionStatus } from '@/lib/builder-types';

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
  filesLoading?: boolean;
  changes?: BuilderFileChange[];
  selectedFilePath?: string;
  onSelectFile?: (path: string) => void;
  onKeepAll?: () => void;
  onDiscardAll?: () => void;
  // ── Workspace / runtime identity (merged from the old BuilderWorkspaceHeader) ──
  /** The bound workspace, or null when none has been selected. */
  workspace?: BuilderWorkspace | null;
  /**
   * Runtime connection status for the status dot.
   *
   * The folder picker is deliberately NOT a canvas prop. It gates sending, which
   * is a conversation concern, so it is owned by BuilderChatPanel and rendered
   * next to the Send button it enables.
   */
  runtimeStatus?: BuilderConnectionStatus | null;
  runtimeLoading?: boolean;
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

/**
 * One label per state, used for the idle heading, the address dot, and the
 * address tooltip — so the same words cannot drift between three places.
 */
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
 *
 * It is deliberately short: heading, one sentence, the command we ran, the log
 * tail, one button. The old version added a framed mock device, a status badge
 * that repeated the heading, and a "Preview opens here when ready" signpost —
 * none of which told the user anything the heading had not.
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

  const explanation =
    status.message ??
    (status.state === 'starting'
      ? 'Running this project’s dev script. The address appears here as soon as it answers.'
      : status.state === 'exited'
        ? 'The dev script stopped before it served an address.'
        : 'Start this project’s dev script and it loads here, resizable to desktop, tablet, or mobile.');

  return (
    /* `min-h-full` plus its own `px-6 py-8`: the frame around this is
       borderless and full-bleed now, so the idle copy has to supply its own
       breathing room or it would sit flush against the canvas edges. The icon
       keeps its border — it is a 36px state chip, not a frame. */
    <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div
        className={`flex size-9 items-center justify-center rounded-xl border border-border/60 bg-card/70 ${badge.className}`}
      >
        {status.state === 'starting' ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : status.state === 'error' ? (
          <TriangleAlertIcon className="size-4" />
        ) : (
          <Globe2Icon className="size-4" />
        )}
      </div>

      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight">{badge.label}</h2>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
          {explanation}
        </p>
      </div>

      {status.command && (
        <div className="flex max-w-md items-center gap-1.5 rounded-md border border-border/60 bg-background/75 px-2 py-1 text-xs text-muted-foreground">
          <span className={`size-1.5 shrink-0 rounded-full ${badge.dot}`} />
          <span className="truncate font-mono">{status.command}</span>
        </div>
      )}

      {status.log.length > 0 && (
        <pre className="max-h-40 w-full max-w-md overflow-auto rounded-lg border border-border/60 bg-muted/40 p-2 text-left font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {status.log.slice(-12).join('\n')}
        </pre>
      )}

      {canStop ? (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs"
          onClick={onStop}
          disabled={stopping}
        >
          <SquareIcon className="size-3.5" />
          {stopping ? 'Stopping…' : 'Stop preview'}
        </Button>
      ) : (
        <Button
          size="sm"
          className="gap-1.5 text-xs"
          onClick={onStart}
          disabled={!canStart || starting}
          // Why it is unavailable lives in the tooltip: the conversation panel
          // owns the one folder call to action, so this canvas does not repeat it.
          title={
            canStart
              ? 'Run this project’s dev script and load it here.'
              : 'Choose a project folder first.'
          }
        >
          <PlayIcon className="size-3.5" />
          {starting
            ? 'Starting…'
            : status.state === 'error' || status.state === 'exited'
              ? 'Try again'
              : 'Start preview'}
        </Button>
      )}
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
  filesLoading = false,
  changes = [],
  selectedFilePath,
  onSelectFile,
  onKeepAll,
  onDiscardAll,
  workspace = null,
  runtimeStatus = null,
  runtimeLoading = false,
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
  const live = Boolean(previewUrl) && previewStatus.state === 'ready';

  // Runtime dot
  const runtimeConnected = runtimeStatus?.state === 'connected';
  const runtimeDot = runtimeLoading
    ? 'bg-amber-400 animate-pulse'
    : runtimeConnected
      ? 'bg-emerald-400'
      : 'bg-muted-foreground/40';
  const runtimeLabel = runtimeLoading
    ? 'Checking'
    : runtimeConnected
      ? 'Connected'
      : runtimeStatus?.state === 'unsupported'
        ? 'Unsupported'
        : runtimeStatus?.state === 'error'
          ? 'Error'
          : 'Offline';

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-muted/20"
      aria-label="Build canvas"
    >
      {/* ── Row 1: identity · surface switch · runtime readout ──────────────── */}
      <div className="flex min-h-9 shrink-0 items-center gap-2 border-b border-border/50 bg-background/80 px-2 backdrop-blur-sm sm:px-3">
        {/* Identity. Truncates before anything else; the badges after it are
            the only fixed-width things in this cluster. */}
        <div className="flex min-w-0 shrink items-center gap-1.5 overflow-hidden">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <WandSparklesIcon className="size-3" />
          </div>
          <span
            className="max-w-[90px] truncate text-xs font-semibold tracking-tight sm:max-w-[180px]"
            title={workspace?.directory}
          >
            {workspace?.name ?? 'No workspace'}
          </span>
          {workspace && (
            <span className="hidden min-w-0 items-center gap-1 text-xs text-muted-foreground lg:flex">
              <Separator orientation="vertical" className="h-3" />
              <GitBranchIcon className="size-3 shrink-0" />
              <span className="max-w-[120px] truncate">
                {workspace.branch ?? 'HEAD'}
              </span>
              {workspace.dirty && (
                <span className="flex shrink-0 items-center gap-0.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangleIcon className="size-3" />
                  {workspace.changedFileCount}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Surface switch — the panel's primary navigation, so it keeps its
            labels and never collapses to glyphs. */}
        <div className="mx-auto flex-none">
          <Tabs
            value={surface}
            onValueChange={(value) => onSurfaceChange(value as BuilderSurface)}
          >
            <TabsList variant="line" className="h-8 gap-0.5 p-0">
              <TabsTrigger
                value="preview"
                className="h-7 flex-none gap-1.5 px-2 text-xs"
              >
                <Globe2Icon className="size-3.5" />
                Preview
              </TabsTrigger>
              <TabsTrigger
                value="code"
                className="h-7 flex-none gap-1.5 px-2 text-xs"
              >
                <Code2Icon className="size-3.5" />
                Code
              </TabsTrigger>
              <TabsTrigger
                value="changes"
                className="h-7 flex-none gap-1.5 px-2 text-xs"
              >
                <GitCompareArrowsIcon className="size-3.5" />
                Changes
                {changes.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-xs leading-none tabular-nums text-muted-foreground">
                    {changes.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Runtime readout, and nothing else. The folder picker used to sit here
            too, but it is the action that gates sending — a conversation
            concern — so it lives beside the Send button instead. With it gone the
            right cluster is a single passive readout, so it holds the far edge
            and stops crowding the surface tabs. */}
        <div
          className="ml-auto hidden shrink-0 items-center gap-1 px-1 text-xs text-muted-foreground lg:flex"
          title={runtimeStatus?.message ?? runtimeLabel}
        >
          <span className={`size-1.5 rounded-full ${runtimeDot}`} />
          <span>{runtimeLabel}</span>
        </div>
      </div>

      {surface === 'preview' ? (
        // No padding: the preview is the surface, not a card sitting on one.
        <div className="flex min-h-0 flex-1 flex-col">
          <WebPreview
            // The URL arrives asynchronously, and WebPreview seeds its own state
            // once — so a new address (or a reload) remounts the shell.
            key={`${previewUrl}#${reloadNonce}`}
            defaultUrl={previewUrl}
            // `rounded-none border-0` override the component's own `rounded-lg
            // border`; they are load-bearing, not decorative.
            className="min-h-0 flex-1 overflow-hidden rounded-none border-0 bg-background"
          >
            {/* ── Row 2: viewport · address · preview actions ─────────────── */}
            <WebPreviewNavigation className="h-8 gap-1 border-b border-border/50 bg-card/70 px-1.5 py-0">
              {/* Viewport presets belong to the preview they resize, and they
                  now resize the live iframe too — not just the placeholder. */}
              <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/60 bg-background/60 p-0.5">
                {VIEWPORTS.map(({ id, label, icon: Icon }) => (
                  <Button
                    key={id}
                    size="icon-xs"
                    variant={viewport === id ? 'secondary' : 'ghost'}
                    className="size-6 rounded-[4px]"
                    aria-label={label}
                    aria-pressed={viewport === id}
                    onClick={() => onViewportChange(id)}
                  >
                    <Icon className="size-3.5" />
                  </Button>
                ))}
              </div>

              <div
                className="mx-1 flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border/50 bg-background px-2"
                title={badge.label}
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${live ? 'bg-emerald-400' : badge.dot}`}
                />
                <WebPreviewUrl
                  value={previewUrl}
                  readOnly
                  disabled
                  aria-label="Local preview address"
                  placeholder="Preview will appear here"
                  className="h-5 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0"
                />
              </div>

              {previewUrl && (
                <Badge
                  variant="outline"
                  className="hidden h-5 shrink-0 gap-1 border-border/70 px-1.5 text-xs font-normal text-muted-foreground sm:inline-flex"
                >
                  {ownsProcess ? 'Qeda preview' : 'Detected'}
                </Badge>
              )}

              <WebPreviewNavigationButton
                tooltip="Reload"
                className="size-6"
                disabled={!previewUrl}
                onClick={() => setReloadNonce((nonce) => nonce + 1)}
              >
                <RefreshCwIcon className="size-3.5" />
              </WebPreviewNavigationButton>
              {/* Only for a process we can actually kill — offering this for a
                  server the agent started would be a button that lies. */}
              {ownsProcess && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1.5 px-2 text-xs"
                  onClick={onStopPreview}
                  disabled={previewStopping}
                >
                  <SquareIcon className="size-3" />
                  {previewStopping ? 'Stopping…' : 'Stop'}
                </Button>
              )}
              <WebPreviewNavigationButton
                tooltip="Open preview in browser"
                className="size-6"
                disabled={!previewUrl}
                onClick={() => previewUrl && onOpenExternal?.(previewUrl)}
              >
                <ExternalLinkIcon className="size-3.5" />
              </WebPreviewNavigationButton>
            </WebPreviewNavigation>

            {/* One frame for both preview states, so the viewport preset means
                the same thing before and after a URL arrives.

                `bg-muted` (not the old decorative radial gradient) is the only
                thing behind the frame now. It has a real job: with the bezel gone
                it is what makes a narrowed tablet/mobile letterbox legible as
                deliberate rather than as a rendering bug. On `desktop` the frame
                is `w-full`, so none of it shows. */}
            <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-muted">
              <div
                /* `mx-auto` is what centres the tablet/mobile presets — without
                   it they hug the left edge. `h-full` with no `max-h` is what
                   "fills its container" means; the old 900px ceiling stopped the
                   preview filling a tall window.

                   `bg-background` stays even though the bezel is gone: it is what
                   the idle state's text and Start button sit on, and it stops a
                   translucent page body from showing the wrapper's `bg-muted`
                   through the iframe. */
                className={`mx-auto flex h-full min-h-0 ${widthClass} flex-col overflow-hidden bg-background transition-[width] duration-300`}
              >
                {previewUrl ? (
                  <WebPreviewBody />
                ) : (
                  <PreviewIdleState
                    status={previewStatus}
                    owner={previewOwner}
                    canStart={canStartPreview}
                    starting={previewStarting}
                    stopping={previewStopping}
                    onStart={onStartPreview}
                    onStop={onStopPreview}
                  />
                )}
              </div>
            </div>
          </WebPreview>
        </div>
      ) : surface === 'code' ? (
        <BuilderCodeWorkspace
          files={files}
          loading={filesLoading}
          selectedPath={selectedFilePath}
          onSelectFile={onSelectFile}
        />
      ) : (
        <BuilderChangesWorkspace
          changes={changes}
          onKeepAll={onKeepAll}
          onDiscardAll={onDiscardAll}
        />
      )}
    </section>
  );
}
