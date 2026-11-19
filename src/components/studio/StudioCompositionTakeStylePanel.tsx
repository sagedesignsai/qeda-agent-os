import { useState } from 'react';
import type { StudioStyling } from '@/lib/studio/types';
import { InspectorAccordionContext } from './inspector/components/InspectorSection';
import {
  GlobalCameraSection,
  GlobalCaptionsSection,
  GlobalDeviceFrameSection,
  GlobalFramingSection,
  GlobalMotionCardsSection,
  GlobalWallpaperSection,
} from './inspector/sections';

export function StudioCompositionTakeStylePanel({
  styling,
  onUpdateStyling,
}: {
  styling: StudioStyling;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
}) {
  const [openTitle, setOpenTitle] = useState<string | null>(null);

  return (
    <section
      aria-label="Take presentation"
      className="border-t border-border/50"
    >
      <div className="px-3 py-3">
        <h3 className="text-xs font-medium">Showcase presentation</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
          Apply the recording editor’s framing, device, motion, background,
          camera, and caption treatments to this layer.
        </p>
      </div>
      <InspectorAccordionContext.Provider value={{ openTitle, setOpenTitle }}>
        <div className="flex flex-col">
          <GlobalFramingSection
            styling={styling}
            onUpdateStyling={onUpdateStyling}
            defaultOpen={false}
          />
          <GlobalDeviceFrameSection
            styling={styling}
            onUpdateStyling={onUpdateStyling}
            defaultOpen={false}
          />
          <GlobalMotionCardsSection
            styling={styling}
            onUpdateStyling={onUpdateStyling}
            defaultOpen={false}
          />
          <GlobalWallpaperSection
            styling={styling}
            onUpdateStyling={onUpdateStyling}
            defaultOpen={false}
          />
          <GlobalCameraSection
            styling={styling}
            onUpdateStyling={onUpdateStyling}
            defaultOpen={false}
          />
          <GlobalCaptionsSection
            styling={styling}
            onUpdateStyling={onUpdateStyling}
            defaultOpen={false}
          />
        </div>
      </InspectorAccordionContext.Provider>
    </section>
  );
}
