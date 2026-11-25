/**
 * components/studio/StudioCommandBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Studio-specific command palette (⌘K in Studio context).
 *
 * Provides quick access to:
 *   • View toggles (Content Library, Inspector, Timeline)
 *   • Actions (Record, Export, Social Kit, Magic Draft, AI Director)
 *   • Timeline tools (Select, Blade, Split, Delete)
 *   • Playback (Play/Pause, Restart, Zoom to fit)
 *   • Recent takes and projects
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  PanelLeftIcon,
  PanelRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PlayIcon,
  PauseIcon,
  RotateCcwIcon,
  Maximize2Icon,
  MousePointerIcon,
  ScissorsIcon,
  SplitIcon,
  Trash2Icon,
  Circle,
  DownloadIcon,
  Share2Icon,
  SparklesIcon,
} from 'lucide-react';
import type {
  StudioAddonDefinition,
  StudioAddonId,
} from '@/components/studio/addons/StudioAddonRegistry';

interface StudioCommandBarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPlaying?: boolean;
  contentLibraryOpen?: boolean;
  inspectorOpen?: boolean;
  timelineOpen?: boolean;
  onToggleContentLibrary?: () => void;
  onToggleInspector?: () => void;
  onToggleTimeline?: () => void;
  onTogglePlayback?: () => void;
  onRestartPlayback?: () => void;
  onZoomToFit?: () => void;
  onRecord?: () => void;
  onExport?: () => void;
  onSocialKit?: () => void;
  onMagicDraft?: () => void;
  onAIDirector?: () => void;
  onSelectTool?: () => void;
  onBladeTool?: () => void;
  onSplitAtPlayhead?: () => void;
  onDeleteClip?: () => void;
  activeTool?: 'select' | 'blade';
  selectedClipId?: string | null;
  addons?: readonly StudioAddonDefinition[];
  onRunAddon?: (addonId: StudioAddonId) => void;
}

export function StudioCommandBar({
  open,
  onOpenChange,
  isPlaying = false,
  contentLibraryOpen = true,
  inspectorOpen = true,
  timelineOpen = true,
  onToggleContentLibrary,
  onToggleInspector,
  onToggleTimeline,
  onTogglePlayback,
  onRestartPlayback,
  onZoomToFit,
  onRecord,
  onExport,
  onSocialKit,
  onMagicDraft,
  onAIDirector,
  onSelectTool,
  onBladeTool,
  onSplitAtPlayhead,
  onDeleteClip,
  activeTool = 'select',
  selectedClipId = null,
  addons = [],
  onRunAddon,
}: StudioCommandBarProps) {
  const [query, setQuery] = useState('');

  // Clear query when dialog opens
  const handleOpenChange = (next: boolean) => {
    if (next) setQuery('');
    onOpenChange(next);
  };

  const close = () => onOpenChange(false);

  const run = (fn?: () => void | Promise<void>) => {
    if (fn) void fn();
    close();
  };

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <Command>
        <CommandInput
          placeholder="Command, action, or tool…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No commands found.</CommandEmpty>

          {/* ── View Toggles ────────────────────────────────────────────────── */}
          <CommandGroup heading="Views">
            {onToggleContentLibrary && (
              <CommandItem
                onSelect={() => run(onToggleContentLibrary)}
                className="cursor-pointer"
              >
                <PanelLeftIcon className="size-4" />
                <span>
                  {contentLibraryOpen ? 'Hide' : 'Show'} Content Library
                </span>
                <CommandShortcut>⌘[</CommandShortcut>
              </CommandItem>
            )}
            {onToggleInspector && (
              <CommandItem
                onSelect={() => run(onToggleInspector)}
                className="cursor-pointer"
              >
                <PanelRightIcon className="size-4" />
                <span>{inspectorOpen ? 'Hide' : 'Show'} Inspector</span>
                <CommandShortcut>⌘]</CommandShortcut>
              </CommandItem>
            )}
            {onToggleTimeline && (
              <CommandItem
                onSelect={() => run(onToggleTimeline)}
                className="cursor-pointer"
              >
                {timelineOpen ? (
                  <ChevronDownIcon className="size-4" />
                ) : (
                  <ChevronUpIcon className="size-4" />
                )}
                <span>{timelineOpen ? 'Collapse' : 'Expand'} Timeline</span>
              </CommandItem>
            )}
          </CommandGroup>

          {addons.length > 0 && onRunAddon && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Add-ons">
                {addons.map((addon) => {
                  const Icon = addon.icon;
                  return (
                    <CommandItem
                      key={addon.id}
                      onSelect={() => run(() => onRunAddon(addon.id))}
                      className="cursor-pointer"
                      keywords={[...addon.keywords]}
                    >
                      <Icon className="size-4 text-primary" />
                      <span>{addon.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />

          {/* ── Playback Controls ───────────────────────────────────────────── */}
          <CommandGroup heading="Playback">
            {onTogglePlayback && (
              <CommandItem
                onSelect={() => run(onTogglePlayback)}
                className="cursor-pointer"
              >
                {isPlaying ? (
                  <>
                    <PauseIcon className="size-4" />
                    <span>Pause</span>
                    <CommandShortcut>Space</CommandShortcut>
                  </>
                ) : (
                  <>
                    <PlayIcon className="size-4" />
                    <span>Play</span>
                    <CommandShortcut>Space</CommandShortcut>
                  </>
                )}
              </CommandItem>
            )}
            {onRestartPlayback && (
              <CommandItem
                onSelect={() => run(onRestartPlayback)}
                className="cursor-pointer"
              >
                <RotateCcwIcon className="size-4" />
                <span>Restart from beginning</span>
                <CommandShortcut>Home</CommandShortcut>
              </CommandItem>
            )}
            {onZoomToFit && (
              <CommandItem
                onSelect={() => run(onZoomToFit)}
                className="cursor-pointer"
              >
                <Maximize2Icon className="size-4" />
                <span>Zoom to fit timeline</span>
              </CommandItem>
            )}
          </CommandGroup>

          <CommandSeparator />

          {/* ── Timeline Tools ──────────────────────────────────────────────── */}
          <CommandGroup heading="Timeline Tools">
            {onSelectTool && (
              <CommandItem
                onSelect={() => run(onSelectTool)}
                className="cursor-pointer"
              >
                <MousePointerIcon className="size-4" />
                <span>{activeTool === 'select' ? '✓ ' : ''}Select tool</span>
                <CommandShortcut>V</CommandShortcut>
              </CommandItem>
            )}
            {onBladeTool && (
              <CommandItem
                onSelect={() => run(onBladeTool)}
                className="cursor-pointer"
              >
                <ScissorsIcon className="size-4" />
                <span>
                  {activeTool === 'blade' ? '✓ ' : ''}Razor blade tool
                </span>
                <CommandShortcut>C</CommandShortcut>
              </CommandItem>
            )}
            {onSplitAtPlayhead && (
              <CommandItem
                onSelect={() => run(onSplitAtPlayhead)}
                className="cursor-pointer"
              >
                <SplitIcon className="size-4" />
                <span>Split at playhead</span>
                <CommandShortcut>B</CommandShortcut>
              </CommandItem>
            )}
            {onDeleteClip && selectedClipId && (
              <CommandItem
                onSelect={() => run(onDeleteClip)}
                className="cursor-pointer"
              >
                <Trash2Icon className="size-4" />
                <span>Delete selected clip</span>
                <CommandShortcut>Del</CommandShortcut>
              </CommandItem>
            )}
          </CommandGroup>

          <CommandSeparator />

          {/* ── Primary Actions ─────────────────────────────────────────────── */}
          <CommandGroup heading="Actions">
            {onRecord && (
              <CommandItem
                onSelect={() => run(onRecord)}
                className="cursor-pointer"
              >
                <Circle className="size-4 text-rose-500 fill-rose-500" />
                <span>Record new take</span>
                <CommandShortcut>⇧R</CommandShortcut>
              </CommandItem>
            )}
            {onAIDirector && (
              <CommandItem
                onSelect={() => run(onAIDirector)}
                className="cursor-pointer"
              >
                <SparklesIcon className="size-4 text-primary" />
                <span>Open AI Director</span>
                <CommandShortcut>⇧A</CommandShortcut>
              </CommandItem>
            )}
            {onMagicDraft && (
              <CommandItem
                onSelect={() => run(onMagicDraft)}
                className="cursor-pointer"
              >
                <SparklesIcon className="size-4" />
                <span>Run Magic Draft</span>
                <CommandShortcut>⇧M</CommandShortcut>
              </CommandItem>
            )}
            {onSocialKit && (
              <CommandItem
                onSelect={() => run(onSocialKit)}
                className="cursor-pointer"
              >
                <Share2Icon className="size-4 text-indigo-500" />
                <span>Generate Release Kit</span>
                <CommandShortcut>⇧K</CommandShortcut>
              </CommandItem>
            )}
            {onExport && (
              <CommandItem
                onSelect={() => run(onExport)}
                className="cursor-pointer"
              >
                <DownloadIcon className="size-4" />
                <span>Export MP4</span>
                <CommandShortcut>⇧E</CommandShortcut>
              </CommandItem>
            )}
          </CommandGroup>

          <CommandSeparator />

          {/* ── Help / Info ─────────────────────────────────────────────────── */}
          <CommandGroup heading="Help">
            <CommandItem disabled className="text-xs text-muted-foreground">
              <span>
                Use arrow keys to navigate, Enter to select, Esc to close
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
