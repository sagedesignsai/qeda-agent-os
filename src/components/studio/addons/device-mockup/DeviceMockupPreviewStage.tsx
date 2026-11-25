import { useState } from 'react';
import { LockIcon, MonitorIcon, SmartphoneIcon } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ClipDeviceFrame } from '@/lib/studio-types';
import { DEFAULT_CLIP_DEVICE_FRAME } from './presets';

type StageBackdrop = 'dark' | 'light' | 'grid';

export interface DeviceMockupPreviewStageProps {
  frame: ClipDeviceFrame;
  clipName: string;
  previewUrl: string | null;
}

export function DeviceMockupPreviewStage({
  frame,
  clipName,
  previewUrl,
}: DeviceMockupPreviewStageProps) {
  const [stageBackdrop, setStageBackdrop] = useState<StageBackdrop>('dark');

  const isLight = frame.theme === 'light';
  const isSilver = frame.theme === 'silver';
  const isWindowOnly = frame.presetId === 'macos-window';
  const pad = Math.max(2, frame.padding ?? DEFAULT_CLIP_DEVICE_FRAME.padding ?? 8);
  const bezelColor =
    frame.color ??
    (frame.type === 'glass'
      ? 'rgba(220, 240, 255, 0.45)'
      : isLight
        ? '#e2e8f0'
        : isSilver
          ? '#94a3b8'
          : '#1e2430');

  const stageBgClass =
    stageBackdrop === 'light'
      ? 'bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300'
      : stageBackdrop === 'grid'
        ? 'bg-[#0b0e14] [background-image:radial-gradient(rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:16px_16px]'
        : 'bg-gradient-to-br from-slate-950 via-[#0d1220] to-indigo-950/60';

  const mediaElement = previewUrl ? (
    <video
      key={previewUrl}
      src={previewUrl}
      muted
      playsInline
      loop
      autoPlay
      className="size-full object-cover"
    />
  ) : (
    <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-primary/20 via-slate-900 to-slate-950 text-muted-foreground">
      {frame.type === 'iphone' ? (
        <SmartphoneIcon className="size-7 text-primary/80" />
      ) : (
        <MonitorIcon className="size-7 text-primary/80" />
      )}
      <span className="text-[11px] font-medium text-foreground/80">
        {clipName}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`relative flex aspect-video max-h-[260px] w-full items-center justify-center overflow-hidden rounded-xl border border-border/60 p-6 transition-colors ${stageBgClass}`}
      >
        {/* Stage backdrop switcher */}
        <div className="absolute right-2.5 top-2.5 z-20">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            spacing={0}
            value={stageBackdrop}
            onValueChange={(v) => {
              if (v) setStageBackdrop(v as StageBackdrop);
            }}
            className="bg-background/80 backdrop-blur-sm"
          >
            <ToggleGroupItem value="dark" className="h-6 px-2 text-[10px]">
              Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="grid" className="h-6 px-2 text-[10px]">
              Grid
            </ToggleGroupItem>
            <ToggleGroupItem value="light" className="h-6 px-2 text-[10px]">
              Light
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Realistic Device / Window Mockup */}
        <div
          className={`relative flex flex-col items-center transition-all ${
            frame.type === 'iphone' ? 'w-[175px]' : 'w-full max-w-[400px]'
          }`}
        >
          <div
            className="relative w-full overflow-hidden transition-all"
            style={{
              padding: frame.type === 'none' ? 0 : `${pad}px`,
              backgroundColor:
                frame.type === 'none'
                  ? 'transparent'
                  : frame.type === 'glass'
                    ? 'rgba(255, 255, 255, 0.14)'
                    : bezelColor,
              borderRadius:
                frame.type === 'none'
                  ? '0.5rem'
                  : frame.type === 'iphone'
                    ? '1.65rem'
                    : '0.75rem',
              border:
                frame.type === 'minimal-svg'
                  ? `1px solid ${bezelColor}`
                  : frame.type === 'glass'
                    ? '1px solid rgba(255, 255, 255, 0.35)'
                    : frame.type === 'none'
                      ? undefined
                      : isLight
                        ? '1px solid rgba(15, 23, 42, 0.15)'
                        : '1px solid rgba(255, 255, 255, 0.14)',
              backdropFilter: frame.type === 'glass' ? 'blur(12px)' : undefined,
              boxShadow:
                frame.type !== 'none' && frame.shadow !== false
                  ? '0 22px 45px -12px rgba(0, 0, 0, 0.65)'
                  : undefined,
            }}
          >
            {/* Browser / macOS Window Titlebar */}
            {frame.type === 'browser' && (
              <div
                className={`mb-1 flex h-6 items-center justify-between rounded-t-md px-2.5 ${
                  isLight
                    ? 'border-b border-slate-300/70 bg-slate-100 text-slate-700'
                    : 'border-b border-white/10 bg-[#131722] text-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[#ff5f57]" />
                  <span className="size-2 rounded-full bg-[#febc2e]" />
                  <span className="size-2 rounded-full bg-[#28c840]" />
                </div>

                {isWindowOnly ? (
                  <span className="truncate text-[10px] font-medium opacity-80">
                    {frame.title || clipName}
                  </span>
                ) : (
                  <div
                    className={`flex h-4 max-w-[60%] items-center gap-1 rounded-full px-2.5 text-[9px] font-medium ${
                      isLight
                        ? 'bg-slate-200/80 text-slate-600'
                        : 'bg-slate-900/90 text-slate-400'
                    }`}
                  >
                    <LockIcon className="size-2.5 shrink-0 opacity-70" />
                    <span className="truncate">
                      {frame.url || 'qeda.app'}
                    </span>
                  </div>
                )}

                <div className="w-8" />
              </div>
            )}

            {/* Screen viewport */}
            <div
              className={`relative w-full overflow-hidden bg-black ${
                frame.type === 'iphone' ? 'aspect-[9/16]' : 'aspect-video'
              }`}
              style={{
                borderRadius:
                  frame.type === 'iphone'
                    ? '1.15rem'
                    : frame.type === 'browser'
                      ? '0 0 0.35rem 0.35rem'
                      : '0.35rem',
              }}
            >
              {mediaElement}

              {/* MacBook Camera Notch */}
              {frame.type === 'macbook' && (
                <div className="absolute left-1/2 top-0 flex h-3 w-16 -translate-x-1/2 items-center justify-center rounded-b-md bg-black">
                  <span className="size-1.5 rounded-full bg-sky-400/70 ring-1 ring-slate-800" />
                </div>
              )}

              {/* iPhone Dynamic Island & Home Indicator */}
              {frame.type === 'iphone' && (
                <>
                  <div className="absolute left-1/2 top-1.5 flex h-3 w-12 -translate-x-1/2 items-center justify-end rounded-full bg-black px-1.5">
                    <span className="size-1.5 rounded-full bg-slate-800" />
                  </div>
                  <div className="absolute bottom-1.5 left-1/2 h-1 w-12 -translate-x-1/2 rounded-full bg-white/75" />
                </>
              )}

              {/* Optional Diagonal Glass Glare */}
              {frame.glare && frame.type !== 'none' && (
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-white/[0.03] to-transparent"
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          {/* MacBook Aluminum Base Deck */}
          {frame.type === 'macbook' && (
            <div
              className={`relative mt-0.5 h-2.5 w-[112%] rounded-b-lg shadow-lg ${
                isSilver
                  ? 'bg-gradient-to-r from-slate-400 via-slate-200 to-slate-400'
                  : 'bg-gradient-to-r from-slate-800 via-slate-600 to-slate-800'
              }`}
            >
              <div className="mx-auto h-1 w-12 rounded-b bg-black/35" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
