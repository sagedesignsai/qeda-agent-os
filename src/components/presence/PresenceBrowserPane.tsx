/**
 * components/presence/PresenceBrowserPane.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The right pane: embedded platform tabs plus internal Presence views.
 *
 * The tab strip is ordinary React. The site itself is a native `WebContentsView`
 * placed over the content rectangle this component measures, so the strip can
 * sit above it without being covered. That split is why a tab switch is instant:
 * React swaps chrome, main swaps which native view is attached.
 *
 * Tabs are created lazily — a configured platform appears in the strip, but its
 * page only loads the first time the tab is activated. Five social sites loading
 * on mount would be a lot of memory for a pane the user may never open.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  FlameIcon,
  GlobeIcon,
  PlusIcon,
  RotateCwIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PresenceActivityView } from './PresenceActivityView';
import { usePresenceBrowser } from '@/hooks/use-presence-browser';
import {
  PLATFORM_LABELS,
  PLATFORM_URLS,
  PRESENCE_PLATFORMS,
  type PresenceBrowserBounds,
  type PresencePlatform,
} from '@/lib/presence';
import { cn } from '@/lib/utils';

type PresenceTab =
  | {
      id: string;
      kind: 'web';
      label: string;
      platform: Exclude<PresencePlatform, 'any'>;
      url: string;
    }
  | { id: string; kind: 'internal'; label: string; view: 'activity' };

const ACTIVITY_TAB: PresenceTab = {
  id: 'internal:activity',
  kind: 'internal',
  label: 'Activity',
  view: 'activity',
};

const WEB_PLATFORMS = PRESENCE_PLATFORMS.filter(
  (platform): platform is Exclude<PresencePlatform, 'any'> =>
    platform !== 'any',
);

function webTab(platform: Exclude<PresencePlatform, 'any'>): PresenceTab {
  return {
    id: `platform:${platform}`,
    kind: 'web',
    label: PLATFORM_LABELS[platform],
    platform,
    url: PLATFORM_URLS[platform],
  };
}

/** Internal views that are planned but not built yet. */
const PLANNED_VIEWS = ['Contacts', 'Email client', 'Bookmarks'] as const;

interface PresenceBrowserPaneProps {
  projectId: string | null;
  /** Platforms from the project's onboarding profile. */
  platforms: string[];
}

export function PresenceBrowserPane({
  projectId,
  platforms,
}: PresenceBrowserPaneProps) {
  const browser = usePresenceBrowser();
  const { browserState } = browser;
  const [tabs, setTabs] = useState<PresenceTab[]>([ACTIVITY_TAB]);
  const [activeId, setActiveId] = useState<string>(ACTIVITY_TAB.id);
  const [bounds, setBounds] = useState<PresenceBrowserBounds | null>(null);
  const [browserError, setBrowserError] = useState<string | null>(null);
  // A native WebContentsView always paints above the renderer, so any menu that
  // opens downward from the tab strip would be drawn *behind* the live site.
  // Hide the view while a menu is open; the effect below re-shows it on close.
  const [menuOpen, setMenuOpen] = useState(false);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const knownPlatforms = useRef('');
  const autoActivated = useRef(false);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeId) ?? tabs[0],
    [tabs, activeId],
  );

  // Append tabs for configured platforms as the profile loads. Existing tabs
  // are never removed here: the user may have closed one on purpose, and a
  // streak broadcast must not resurrect it.
  useEffect(() => {
    const key = platforms.join('|');
    if (key === knownPlatforms.current) return;
    knownPlatforms.current = key;

    const configured = WEB_PLATFORMS.filter((platform) =>
      platforms.includes(platform),
    );
    if (configured.length === 0) return;

    setTabs((current) => {
      const open = new Set(
        current
          .filter(
            (tab): tab is Extract<PresenceTab, { kind: 'web' }> =>
              tab.kind === 'web',
          )
          .map((tab) => tab.platform),
      );
      const additions = configured
        .filter((platform) => !open.has(platform))
        .map(webTab);
      return additions.length > 0 ? [...current, ...additions] : current;
    });

    if (!autoActivated.current) {
      autoActivated.current = true;
      setActiveId(`platform:${configured[0]}`);
    }
  }, [platforms]);

  // Measure the pane and keep the native view glued to it.
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      setBounds((previous) => {
        const next = {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        if (
          previous &&
          previous.x === next.x &&
          previous.y === next.y &&
          previous.width === next.width &&
          previous.height === next.height
        ) {
          return previous;
        }
        return next;
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Show the active web tab, or hide the native view for an internal tab or an
  // open menu that would otherwise be obscured by it.
  useEffect(() => {
    if (!activeTab || activeTab.kind !== 'web' || menuOpen) {
      void browser.hide().catch(() => undefined);
      return;
    }
    if (!bounds || bounds.width < 2 || bounds.height < 2) return;

    setBrowserError(null);
    void browser
      .show(activeTab.id, activeTab.url, bounds)
      .catch((error: unknown) => {
        setBrowserError(error instanceof Error ? error.message : String(error));
      });
  }, [activeTab, bounds, browser, menuOpen]);

  // Leaving the page closes the native pages; the persistent partition keeps the
  // logins, so returning is one load, not one sign-in.
  useEffect(() => {
    return () => {
      void window.electron.ipc
        .invoke('presence:browser-close-all')
        .catch(() => undefined);
    };
  }, []);

  const activate = (id: string) => setActiveId(id);

  const addPlatform = (platform: Exclude<PresencePlatform, 'any'>) => {
    const tab = webTab(platform);
    setTabs((current) =>
      current.some((value) => value.id === tab.id)
        ? current
        : [...current, tab],
    );
    setActiveId(tab.id);
  };

  const closeTab = useCallback(
    (id: string) => {
      void browser.close(id).catch(() => undefined);

      const index = tabs.findIndex((tab) => tab.id === id);
      const next = tabs.filter((tab) => tab.id !== id);
      const resolved = next.length > 0 ? next : [ACTIVITY_TAB];

      setTabs(resolved);
      if (id === activeId) {
        const neighbour = resolved[Math.max(0, index - 1)] ?? resolved[0];
        setActiveId(neighbour.id);
      }
    },
    [activeId, browser, tabs],
  );

  const openPlatforms = new Set(
    tabs
      .filter(
        (tab): tab is Extract<PresenceTab, { kind: 'web' }> =>
          tab.kind === 'web',
      )
      .map((tab) => tab.platform),
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-card/20 px-1.5">
        <div
          role="tablist"
          aria-label="Presence tabs"
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab?.id;
            const Icon = tab.kind === 'internal' ? FlameIcon : GlobeIcon;
            return (
              <div
                key={tab.id}
                className={cn(
                  'group flex shrink-0 items-center rounded-md border',
                  active
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-transparent hover:bg-muted/60',
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => activate(tab.id)}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded-md pl-2 text-[11px] font-medium',
                    tab.kind === 'web' ? 'pr-1' : 'pr-2',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-3 shrink-0',
                      active ? 'text-amber-500' : 'text-muted-foreground',
                    )}
                  />
                  <span className="max-w-[8.5rem] truncate">{tab.label}</span>
                </button>
                {tab.kind === 'web' && (
                  <button
                    type="button"
                    onClick={() => closeTab(tab.id)}
                    aria-label={`Close ${tab.label}`}
                    className={cn(
                      'mr-1 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground',
                      active
                        ? 'opacity-70'
                        : 'opacity-0 group-hover:opacity-70',
                    )}
                  >
                    <XIcon className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {activeTab?.kind === 'web' && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => void browser.back(activeTab.id)}
                title="Back"
                disabled={browserState?.canGoBack !== true}
              >
                <ArrowLeftIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => void browser.forward(activeTab.id)}
                title="Forward"
                disabled={browserState?.canGoForward !== true}
              >
                <ArrowRightIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => void browser.reload(activeTab.id)}
                title="Reload"
              >
                <RotateCwIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => void browser.openExternal(activeTab.id)}
                title="Open in browser"
              >
                <ExternalLinkIcon className="size-3.5" />
              </Button>
            </>
          )}

          <DropdownMenu onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                title="Add a tab"
              >
                <PlusIcon className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Social platforms
              </DropdownMenuLabel>
              {WEB_PLATFORMS.filter(
                (platform) => !openPlatforms.has(platform),
              ).map((platform) => (
                <DropdownMenuItem
                  key={platform}
                  onClick={() => addPlatform(platform)}
                  className="text-xs"
                >
                  <GlobeIcon className="size-3.5 text-muted-foreground" />
                  {PLATFORM_LABELS[platform]}
                </DropdownMenuItem>
              ))}
              {WEB_PLATFORMS.every((platform) =>
                openPlatforms.has(platform),
              ) && (
                <DropdownMenuItem disabled className="text-xs">
                  Every platform is already open
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Presence views
              </DropdownMenuLabel>
              <DropdownMenuItem disabled className="text-xs">
                <FlameIcon className="size-3.5 text-muted-foreground" />
                Activity
                <span className="ml-auto text-[9px] text-muted-foreground">
                  open
                </span>
              </DropdownMenuItem>
              {PLANNED_VIEWS.map((label) => (
                <DropdownMenuItem key={label} disabled className="text-xs">
                  <SparklesIcon className="size-3.5 text-muted-foreground" />
                  {label}
                  <span className="ml-auto text-[9px] text-muted-foreground">
                    soon
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* URL pill and loading bar for web tabs */}
      {activeTab?.kind === 'web' && browserState && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-card/10 px-3 py-1">
          {browserState.loading && (
            <div className="h-0.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-500/60" />
            </div>
          )}
          {!browserState.loading && browserState.url && (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
              <GlobeIcon className="size-3 shrink-0" />
              <span className="truncate">
                {browserState.title || new URL(browserState.url).hostname}
              </span>
            </div>
          )}
          {browserState.error && (
            <p className="ml-auto shrink-0 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
              {browserState.error}
            </p>
          )}
        </div>
      )}

      <div ref={contentRef} className="relative min-h-0 flex-1 overflow-hidden">
        {activeTab?.kind === 'internal' ? (
          <PresenceActivityView projectId={projectId} />
        ) : (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-muted/70">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-medium">
                {activeTab?.label ?? 'Platform'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                Sign in once and this tab stays signed in. Only the configured
                social platforms can load here.
              </p>
            </div>
            {browserError && (
              <p className="max-w-sm rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
                {browserError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
