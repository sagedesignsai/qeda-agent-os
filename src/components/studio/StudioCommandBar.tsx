/**
 * components/studio/StudioCommandBar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Studio-specific command palette (⌘K in Studio context).
 *
 * Groups:
 *   • Views            – panel visibility
 *   • Add-ons          – canvas/clip add-on dialogs
 *   • Playback         – transport controls
 *   • Timeline Tools   – select/blade/split/delete
 *   • Clip Properties  – blend mode, transform ranges, effects, keyframes
 *   • Effects          – add a specific clip-attached effect
 *   • Text & Shapes    – shape library, shape editor, text animation
 *   • Background       – generative background studio
 *   • Actions          – record, export, social kit, magic draft
 *   • Help             – keyboard hints
 *
 * Search is handled by cmdk across every group, and item `keywords` include
 * natural synonyms ("multiply", "typewriter", "spotlight", …).
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
  LayersIcon,
  Move3dIcon,
  TypeIcon,
  ShapesIcon,
  PaletteIcon,
  KeyRoundIcon,
  CopyIcon,
  PlusIcon,
  Wand2Icon,
  ZoomInIcon,
} from 'lucide-react';
import type { TimelineClip, TimelineTrack, StudioEffectType } from '@/lib/studio/types';
import { STUDIO_EFFECTS } from '@/lib/studio/effects/catalog';
import {
  getBlendModeOption,
  isNonDefaultBlendMode,
} from '@/lib/studio/blend-modes';
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
  /** Selected clip/track drive context-aware feature commands. */
  selectedClip?: TimelineClip | null;
  selectedTrack?: TimelineTrack | null;
  onOpenBlendMode?: () => void;
  onOpenTransformRange?: () => void;
  onOpenEffectsStudio?: () => void;
  onAddZoomAtPlayhead?: () => void;
  onOpenEffectPicker?: () => void;
  onAddEffect?: (effectType: StudioEffectType) => void;
  onOpenTextAnimator?: () => void;
  onOpenShapeEditor?: () => void;
  onShowShapesTab?: () => void;
  onOpenBackgroundStudio?: () => void;
  onAddKeyframe?: () => void;
  onClearKeyframes?: () => void;
  onCopyKeyframes?: () => void;
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
  selectedClip = null,
  selectedTrack = null,
  onOpenBlendMode,
  onOpenTransformRange,
  onOpenEffectsStudio,
  onAddZoomAtPlayhead,
  onOpenEffectPicker,
  onAddEffect,
  onOpenTextAnimator,
  onOpenShapeEditor,
  onShowShapesTab,
  onOpenBackgroundStudio,
  onAddKeyframe,
  onClearKeyframes,
  onCopyKeyframes,
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

  // Derived capability flags. Commands only appear when they can act on the
  // current selection, so the palette never offers dead ends.
  const isShapeClip =
    selectedClip?.itemType === 'shape' ||
    Boolean(
      selectedClip?.payload &&
        'shapeKind' in (selectedClip.payload as Record<string, unknown>),
    );
  const isVisualClip =
    selectedTrack?.type === 'video' ||
    selectedTrack?.type === 'overlays' ||
    isShapeClip;
  const isTextClip =
    selectedTrack?.type === 'captions' || selectedClip?.itemType === 'text';
  const canCompose = isVisualClip || isTextClip;
  const hasKeyframes = (selectedClip?.payload?.keyframes?.length ?? 0) > 0;
  const activeBlend = getBlendModeOption(selectedClip?.payload?.blendMode);
  const effectCount = selectedClip?.payload?.effects?.length ?? 0;

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
                keywords={['library', 'media', 'sidebar', 'panel']}
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
                keywords={['properties', 'panel', 'right']}
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
                keywords={['tracks', 'expand', 'collapse']}
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
                keywords={['play', 'pause', 'transport']}
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
                keywords={['rewind', 'beginning', 'start']}
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
                keywords={['fit', 'scale', 'zoom']}
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
                keywords={['cursor', 'pointer', 'select']}
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
                keywords={['razor', 'cut', 'blade']}
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
                keywords={['cut', 'split', 'playhead']}
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
                keywords={['remove', 'delete', 'trash']}
              >
                <Trash2Icon className="size-4" />
                <span>Delete selected clip</span>
                <CommandShortcut>Del</CommandShortcut>
              </CommandItem>
            )}
          </CommandGroup>

          {canCompose && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Clip Properties">
                {onOpenBlendMode && (
                  <CommandItem
                    onSelect={() => run(onOpenBlendMode)}
                    className="cursor-pointer"
                    keywords={['blend', 'composite', 'multiply', 'screen', 'overlay', 'mode']}
                  >
                    <LayersIcon className="size-4 text-sky-400" />
                    <span>
                      Set Blend Mode
                      {isNonDefaultBlendMode(selectedClip?.payload?.blendMode)
                        ? ` (${activeBlend.label})`
                        : ''}
                    </span>
                    <CommandShortcut>⇧B</CommandShortcut>
                  </CommandItem>
                )}
                {onOpenTransformRange && (
                  <CommandItem
                    onSelect={() => run(onOpenTransformRange)}
                    className="cursor-pointer"
                    keywords={['transform', 'range', 'position', 'scale', 'rotation', 'limits']}
                  >
                    <Move3dIcon className="size-4" />
                    <span>Advanced Transform Ranges</span>
                  </CommandItem>
                )}
                {onOpenEffectsStudio && (
                  <CommandItem
                    onSelect={() => run(onOpenEffectsStudio)}
                    className="cursor-pointer"
                    keywords={['effects', 'studio', 'keyframes', 'params', 'mask']}
                  >
                    <SparklesIcon className="size-4 text-sky-400" />
                    <span>Open Effects Studio…</span>
                  </CommandItem>
                )}
                {onAddZoomAtPlayhead && (
                  <CommandItem
                    onSelect={() => run(onAddZoomAtPlayhead)}
                    className="cursor-pointer"
                    keywords={['zoom', 'camera', 'kinetic', 'punch-in', 'add']}
                  >
                    <ZoomInIcon className="size-4 text-violet-400" />
                    <span>Add Zoom at Playhead</span>
                  </CommandItem>
                )}
                {onAddEffect && onOpenEffectPicker && (
                  <CommandItem
                    onSelect={() => run(onOpenEffectPicker)}
                    className="cursor-pointer"
                    keywords={['add', 'effect', 'filter', 'fx']}
                    disabled={effectCount >= 5}
                  >
                    <PlusIcon className="size-4" />
                    <span>Add Effect…</span>
                    <CommandShortcut>⇧F</CommandShortcut>
                  </CommandItem>
                )}
                {onAddKeyframe && (
                  <CommandItem
                    onSelect={() => run(onAddKeyframe)}
                    className="cursor-pointer"
                    keywords={['keyframe', 'animate', 'position', 'add']}
                  >
                    <KeyRoundIcon className="size-4 text-amber-400" />
                    <span>Add Position Keyframe</span>
                    <CommandShortcut>K</CommandShortcut>
                  </CommandItem>
                )}
                {onCopyKeyframes && hasKeyframes && (
                  <CommandItem
                    onSelect={() => run(onCopyKeyframes)}
                    className="cursor-pointer"
                    keywords={['keyframe', 'copy', 'duplicate']}
                  >
                    <CopyIcon className="size-4" />
                    <span>Copy Clip Keyframes</span>
                  </CommandItem>
                )}
                {onClearKeyframes && hasKeyframes && (
                  <CommandItem
                    onSelect={() => run(onClearKeyframes)}
                    className="cursor-pointer"
                    keywords={['keyframe', 'clear', 'remove', 'delete']}
                  >
                    <Trash2Icon className="size-4" />
                    <span>Clear Clip Keyframes</span>
                  </CommandItem>
                )}
              </CommandGroup>
            </>
          )}

          {isVisualClip && onAddEffect && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Effects">
                {STUDIO_EFFECTS.map((effect) => (
                  <CommandItem
                    key={effect.type}
                    onSelect={() => run(() => onAddEffect(effect.type))}
                    className="cursor-pointer"
                    keywords={[
                      'effect',
                      'add',
                      effect.category,
                      effect.type.replaceAll('-', ' '),
                      effect.label,
                    ]}
                    disabled={effectCount >= 5}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: effect.accent }}
                    />
                    <span>Add {effect.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="Text & Shapes">
            {onShowShapesTab && (
              <CommandItem
                onSelect={() => run(onShowShapesTab)}
                className="cursor-pointer"
                keywords={['shapes', 'vector', 'rectangle', 'circle', 'arrow', 'library']}
              >
                <ShapesIcon className="size-4 text-amber-400" />
                <span>Show Shapes Library</span>
              </CommandItem>
            )}
            {onOpenShapeEditor && isShapeClip && (
              <CommandItem
                onSelect={() => run(onOpenShapeEditor)}
                className="cursor-pointer"
                keywords={['shape', 'edit', 'path', 'svg', 'trim', 'stroke', 'fill']}
              >
                <Wand2Icon className="size-4 text-amber-400" />
                <span>Edit Shape…</span>
                <CommandShortcut>⇧S</CommandShortcut>
              </CommandItem>
            )}
            {onOpenTextAnimator && isTextClip && (
              <CommandItem
                onSelect={() => run(onOpenTextAnimator)}
                className="cursor-pointer"
                keywords={['text', 'animation', 'typewriter', 'fade', 'slide', 'caption', 'reveal']}
              >
                <TypeIcon className="size-4 text-teal-400" />
                <span>Text Animation…</span>
                <CommandShortcut>⇧T</CommandShortcut>
              </CommandItem>
            )}
          </CommandGroup>

          {onOpenBackgroundStudio && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Background">
                <CommandItem
                  onSelect={() => run(onOpenBackgroundStudio)}
                  className="cursor-pointer"
                  keywords={['background', 'wallpaper', 'generative', 'canvas', 'gradient', 'aurora']}
                >
                  <PaletteIcon className="size-4 text-indigo-400" />
                  <span>Configure Canvas Background…</span>
                </CommandItem>
              </CommandGroup>
            </>
          )}

          <CommandSeparator />

          {/* ── Primary Actions ─────────────────────────────────────────────── */}
          <CommandGroup heading="Actions">
            {onRecord && (
              <CommandItem
                onSelect={() => run(onRecord)}
                className="cursor-pointer"
                keywords={['record', 'capture', 'take']}
              >
                <Circle className="size-4 fill-rose-500 text-rose-500" />
                <span>Record new take</span>
                <CommandShortcut>⇧R</CommandShortcut>
              </CommandItem>
            )}
            {onAIDirector && (
              <CommandItem
                onSelect={() => run(onAIDirector)}
                className="cursor-pointer"
                keywords={['ai', 'director', 'copilot', 'agent']}
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
                keywords={['magic', 'draft', 'ai', 'auto']}
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
                keywords={['social', 'release', 'kit', 'share']}
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
                keywords={['export', 'render', 'mp4', 'video']}
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