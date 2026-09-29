/**
 * components/studio/StudioInspector.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dials and settings inspector for Studio showcase styling, camera zoom,
 * captions, and autonomous agent actions.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  SparklesIcon,
  VideoIcon,
  Share2Icon,
  SlidersIcon,
  CropIcon,
  CameraIcon,
  SubtitlesIcon,
  DownloadIcon,
  RefreshCwIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { StudioStyling } from '@/main/ipc/channels';

interface StudioInspectorProps {
  styling: StudioStyling;
  isProcessingDraft: boolean;
  isGeneratingSocialKit: boolean;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
  onRunMagicDraft: () => void;
  onGenerateSocialKit: () => void;
  onExportVideo: (format: 'mp4' | 'gif') => void;
  onAddZoomAtPlayhead?: () => void;
  onToggleCollapse?: () => void;
}

const BG_PRESETS = [
  {
    name: 'Midnight Indigo',
    value: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
    color: '#1e1b4b',
  },
  {
    name: 'Cyber Violet',
    value: 'linear-gradient(135deg, #2e1065 0%, #1e1b4b 50%, #09090b 100%)',
    color: '#2e1065',
  },
  {
    name: 'Obsidian Glow',
    value: 'linear-gradient(135deg, #18181b 0%, #09090b 50%, #000000 100%)',
    color: '#18181b',
  },
  {
    name: 'Emerald Aurora',
    value: 'linear-gradient(135deg, #064e3b 0%, #022c22 50%, #020617 100%)',
    color: '#064e3b',
  },
  {
    name: 'Sunset Ember',
    value: 'linear-gradient(135deg, #451a03 0%, #1c1917 50%, #0c0a09 100%)',
    color: '#451a03',
  },
];

export function StudioInspector({
  styling,
  isProcessingDraft,
  isGeneratingSocialKit,
  onUpdateStyling,
  onRunMagicDraft,
  onGenerateSocialKit,
  onExportVideo,
  onAddZoomAtPlayhead,
  onToggleCollapse,
}: StudioInspectorProps) {
  return (
    <div className="w-full flex flex-col h-full bg-card/40 backdrop-blur-md select-none overflow-y-auto">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="p-3 px-4 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersIcon className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-xs">Studio Inspector</h3>
        </div>
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Collapse inspector"
          >
            <XIcon className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* ── Quick Magic Draft Action ────────────────────────────────────────── */}
      <div className="p-4 border-b border-border/30 bg-primary/5 flex flex-col gap-2">
        <Button
          variant="default"
          size="sm"
          className="w-full gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md font-medium"
          onClick={onRunMagicDraft}
          disabled={isProcessingDraft}
        >
          {isProcessingDraft ? (
            <RefreshCwIcon className="w-4 h-4 animate-spin" />
          ) : (
            <SparklesIcon className="w-4 h-4" />
          )}
          {isProcessingDraft ? 'Agent Processing...' : 'Re-Run Magic Draft'}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          Auto-cuts dead air & recalculates kinetic zoom curves
        </p>
      </div>

      {/* ── Settings Tabs ────────────────────────────────────────────────────── */}
      <Tabs defaultValue="canvas" className="w-full flex-1 flex flex-col">
        <TabsList className="grid grid-cols-3 mx-4 mt-3 bg-secondary/50">
          <TabsTrigger value="canvas" className="text-xs">
            <CropIcon className="w-3.5 h-3.5 mr-1" />
            Canvas
          </TabsTrigger>
          <TabsTrigger value="camera" className="text-xs">
            <CameraIcon className="w-3.5 h-3.5 mr-1" />
            Camera
          </TabsTrigger>
          <TabsTrigger value="captions" className="text-xs">
            <SubtitlesIcon className="w-3.5 h-3.5 mr-1" />
            Captions
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Canvas & Framing ────────────────────────────────────────── */}
        <TabsContent value="canvas" className="p-4 flex flex-col gap-5">
          {/* Aspect Ratio */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">
              Aspect Ratio
            </Label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['16:9', '9:16', '1:1', '4:3'] as const).map((ratio) => (
                <Button
                  key={ratio}
                  variant={
                    styling.aspectRatio === ratio ? 'default' : 'outline'
                  }
                  size="sm"
                  className="h-8 text-xs font-mono"
                  onClick={() => onUpdateStyling({ aspectRatio: ratio })}
                >
                  {ratio}
                </Button>
              ))}
            </div>
          </div>

          {/* Padding */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <Label className="text-muted-foreground">Canvas Padding</Label>
              <span className="font-mono text-muted-foreground">
                {styling.padding}%
              </span>
            </div>
            <Slider
              value={[styling.padding]}
              min={10}
              max={65}
              step={2}
              onValueChange={([val]) => onUpdateStyling({ padding: val })}
            />
          </div>

          {/* Corner Radius */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <Label className="text-muted-foreground">Corner Radius</Label>
              <span className="font-mono text-muted-foreground">
                {styling.borderRadius}px
              </span>
            </div>
            <Slider
              value={[styling.borderRadius]}
              min={0}
              max={32}
              step={2}
              onValueChange={([val]) => onUpdateStyling({ borderRadius: val })}
            />
          </div>

          {/* Wallpaper Theme */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">
              Wallpaper Theme
            </Label>
            <div className="grid grid-cols-5 gap-2">
              {BG_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  title={preset.name}
                  onClick={() => onUpdateStyling({ background: preset.value })}
                  style={{ background: preset.color }}
                  className={`h-7 rounded-md border transition-all ${
                    styling.background === preset.value
                      ? 'ring-2 ring-primary border-primary scale-105'
                      : 'border-border/60 hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab 2: Camera & Kinetic Zoom ───────────────────────────────────── */}
        <TabsContent value="camera" className="p-4 flex flex-col gap-5">
          {/* Zoom Intensity */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <Label className="text-muted-foreground">Zoom Intensity</Label>
              <span className="font-mono text-muted-foreground">
                {(styling.zoomIntensity ?? 1.5).toFixed(1)}x
              </span>
            </div>
            <Slider
              value={[styling.zoomIntensity ?? 1.5]}
              min={1.1}
              max={2.4}
              step={0.1}
              onValueChange={([val]) => onUpdateStyling({ zoomIntensity: val })}
            />
          </div>

          {/* Camera Easing */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">
              Camera Easing
            </Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['smooth', 'snappy', 'cinematic'] as const).map((easing) => (
                <Button
                  key={easing}
                  variant={
                    styling.cameraEasing === easing ? 'default' : 'outline'
                  }
                  size="sm"
                  className="h-8 text-xs capitalize"
                  onClick={() => onUpdateStyling({ cameraEasing: easing })}
                >
                  {easing}
                </Button>
              ))}
            </div>
          </div>

          {/* Add Zoom Marker Button */}
          {onAddZoomAtPlayhead && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 border-dashed"
              onClick={onAddZoomAtPlayhead}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Add Zoom At Playhead
            </Button>
          )}
        </TabsContent>

        {/* ── Tab 3: Captions & Subtitles ────────────────────────────────────── */}
        <TabsContent value="captions" className="p-4 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">
              Display Subtitles
            </Label>
            <Switch
              checked={styling.showCaptions}
              onCheckedChange={(checked) =>
                onUpdateStyling({ showCaptions: checked })
              }
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">
              Subtitle Style
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {(['karaoke', 'minimal'] as const).map((style) => (
                <Button
                  key={style}
                  variant={
                    styling.captionStyle === style ? 'default' : 'outline'
                  }
                  size="sm"
                  className="h-8 text-xs capitalize"
                  onClick={() => onUpdateStyling({ captionStyle: style })}
                >
                  {style}
                </Button>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Footer Export & Social Kit CTAs ─────────────────────────────────── */}
      <div className="p-4 border-t border-border/30 flex flex-col gap-2 mt-auto bg-card/60">
        <Button
          variant="secondary"
          size="sm"
          className="w-full gap-2"
          onClick={onGenerateSocialKit}
          disabled={isGeneratingSocialKit}
        >
          {isGeneratingSocialKit ? (
            <RefreshCwIcon className="w-4 h-4 animate-spin" />
          ) : (
            <Share2Icon className="w-4 h-4 text-indigo-400" />
          )}
          AI Social Release Kit
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="default"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => onExportVideo('mp4')}
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            Export MP4
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => onExportVideo('gif')}
          >
            <VideoIcon className="w-3.5 h-3.5" />
            Export GIF
          </Button>
        </div>
      </div>
    </div>
  );
}
