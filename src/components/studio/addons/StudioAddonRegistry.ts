import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MonitorIcon, PaletteIcon } from 'lucide-react';
import type {
  StudioStyling,
  TimelineClip,
  TimelineTrack,
} from '@/lib/studio-types';
import { resolveTimelineItemType } from '@/lib/studio/timeline/item-type';
import { StudioCanvasBackgroundAddonDialog } from './StudioCanvasBackgroundAddonDialog';
import { StudioDeviceMockupAddonDialog } from './StudioDeviceMockupAddonDialog';

export type StudioAddonId = 'clip-device-mockup' | 'canvas-background';

interface StudioAddonDialogBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface StudioClipAddonDialogProps
  extends StudioAddonDialogBaseProps {
  clip: TimelineClip;
  track: TimelineTrack;
  videoUrl: string | null;
  onApply: (patch: Partial<TimelineClip>) => boolean;
}

export interface StudioCanvasAddonDialogProps
  extends StudioAddonDialogBaseProps {
  styling: StudioStyling;
  onApply: (background: string) => void;
}

interface StudioAddonDefinitionBase {
  id: StudioAddonId;
  name: string;
  description: string;
  keywords: readonly string[];
  icon: LucideIcon;
}

export interface StudioClipAddonDefinition extends StudioAddonDefinitionBase {
  id: 'clip-device-mockup';
  scope: 'clip';
  canRun: (track: TimelineTrack, clip: TimelineClip) => boolean;
  Dialog: ComponentType<StudioClipAddonDialogProps>;
}

export interface StudioCanvasAddonDefinition extends StudioAddonDefinitionBase {
  id: 'canvas-background';
  scope: 'canvas';
  Dialog: ComponentType<StudioCanvasAddonDialogProps>;
}

export type StudioAddonDefinition =
  | StudioClipAddonDefinition
  | StudioCanvasAddonDefinition;

function supportsVideoClip(track: TimelineTrack, clip: TimelineClip): boolean {
  return (
    track.type === 'video' &&
    resolveTimelineItemType(track.type, clip.itemType, clip.payload) === 'video'
  );
}

export const BUILTIN_STUDIO_ADDONS: readonly StudioAddonDefinition[] = [
  {
    id: 'clip-device-mockup',
    name: 'Add Device Mockup',
    description: 'Frame this video clip as a browser, laptop, or phone.',
    keywords: ['device', 'mockup', 'frame', 'browser', 'macbook', 'iphone'],
    icon: MonitorIcon,
    scope: 'clip',
    canRun: supportsVideoClip,
    Dialog: StudioDeviceMockupAddonDialog,
  },
  {
    id: 'canvas-background',
    name: 'Configure Canvas Background',
    description:
      'Generate animated Bauhaus, wave, aurora, or WebGL shader backgrounds and gradients.',
    keywords: [
      'canvas',
      'background',
      'wallpaper',
      'color',
      'gradient',
      'generator',
      'animated',
      'shader',
      'bauhaus',
      'waves',
      'preset',
    ],
    icon: PaletteIcon,
    scope: 'canvas',
    Dialog: StudioCanvasBackgroundAddonDialog,
  },
];
