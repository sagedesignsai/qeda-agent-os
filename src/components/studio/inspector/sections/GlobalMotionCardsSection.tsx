/**
 * components/studio/inspector/sections/GlobalMotionCardsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspector section for Intro & Outro Motion Cards:
 *   - Intro Title Card toggle, title, subtitle, badge, preset selection
 *   - Outro CTA Card toggle, title, subtitle, badge, preset selection
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import { FilmIcon, LayersIcon, SparklesIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { StudioStyling, StudioMotionCard } from '@/lib/studio-types';
import {
  InspectorSection,
  InspectorSegmentedGroup,
  InspectorFieldRow,
} from '../components';

interface GlobalMotionCardsSectionProps {
  styling: StudioStyling;
  onUpdateStyling: (updates: Partial<StudioStyling>) => void;
  defaultOpen?: boolean;
}

export function GlobalMotionCardsSection({
  styling,
  onUpdateStyling,
  defaultOpen = false,
}: GlobalMotionCardsSectionProps) {
  const introCard: StudioMotionCard = styling.introCard || {
    enabled: false,
    title: 'Product Walkthrough',
    subtitle: 'Built with Qeda Studio',
    badge: 'NEW RELEASE',
    durationMs: 3000,
    preset: 'minimal',
  };

  const outroCard: StudioMotionCard = styling.outroCard || {
    enabled: false,
    title: 'Try Qeda Today',
    subtitle: 'qeda.app • Open Source Agent OS',
    badge: 'GET STARTED',
    durationMs: 3000,
    preset: 'gradient',
  };

  const updateIntro = (patch: Partial<StudioMotionCard>) => {
    onUpdateStyling({
      introCard: { ...introCard, ...patch },
    });
  };

  const updateOutro = (patch: Partial<StudioMotionCard>) => {
    onUpdateStyling({
      outroCard: { ...outroCard, ...patch },
    });
  };

  return (
    <InspectorSection
      title="Intro & Outro Cards"
      icon={<FilmIcon className="w-3.5 h-3.5 text-muted-foreground" />}
      badge={introCard.enabled || outroCard.enabled ? 'ACTIVE' : 'OFF'}
      defaultOpen={defaultOpen}
    >
      {/* ── Intro Card Configuration ────────────────────────────────────────── */}
      <div className="p-2.5 rounded-lg border border-border/40 bg-muted/10 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[11px] text-foreground flex items-center gap-1.5">
            <LayersIcon className="w-3 h-3 text-primary" />
            Intro Motion Card
          </span>
          <Button
            type="button"
            variant={introCard.enabled ? 'default' : 'outline'}
            size="sm"
            className="h-5 text-[9px] px-2 font-mono cursor-pointer"
            onClick={() => updateIntro({ enabled: !introCard.enabled })}
          >
            {introCard.enabled ? 'ENABLED' : 'DISABLED'}
          </Button>
        </div>

        {introCard.enabled && (
          <div className="flex flex-col gap-2 mt-1 pt-1 border-t border-border/30">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Title</Label>
              <Input
                value={introCard.title}
                onChange={(e) => updateIntro({ title: e.target.value })}
                className="h-6 text-xs bg-background/50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Subtitle</Label>
              <Input
                value={introCard.subtitle || ''}
                onChange={(e) => updateIntro({ subtitle: e.target.value })}
                className="h-6 text-xs bg-background/50"
              />
            </div>
            <InspectorFieldRow label="Preset" icon={<SparklesIcon className="w-3 h-3" />}>
              <InspectorSegmentedGroup
                value={introCard.preset || 'minimal'}
                onChange={(val) => updateIntro({ preset: val as 'minimal' | 'kinetic' | 'gradient' | 'cyber' })}
                options={[
                  { value: 'minimal', label: 'Dark' },
                  { value: 'kinetic', label: 'Glow' },
                  { value: 'gradient', label: 'Mesh' },
                  { value: 'cyber', label: 'Cyber' },
                ]}
              />
            </InspectorFieldRow>
          </div>
        )}
      </div>

      {/* ── Outro Card Configuration ────────────────────────────────────────── */}
      <div className="p-2.5 rounded-lg border border-border/40 bg-muted/10 flex flex-col gap-2 text-xs mt-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[11px] text-foreground flex items-center gap-1.5">
            <LayersIcon className="w-3 h-3 text-indigo-400" />
            Outro Call to Action
          </span>
          <Button
            type="button"
            variant={outroCard.enabled ? 'default' : 'outline'}
            size="sm"
            className="h-5 text-[9px] px-2 font-mono cursor-pointer"
            onClick={() => updateOutro({ enabled: !outroCard.enabled })}
          >
            {outroCard.enabled ? 'ENABLED' : 'DISABLED'}
          </Button>
        </div>

        {outroCard.enabled && (
          <div className="flex flex-col gap-2 mt-1 pt-1 border-t border-border/30">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Title</Label>
              <Input
                value={outroCard.title}
                onChange={(e) => updateOutro({ title: e.target.value })}
                className="h-6 text-xs bg-background/50"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] text-muted-foreground">Subtitle / URL</Label>
              <Input
                value={outroCard.subtitle || ''}
                onChange={(e) => updateOutro({ subtitle: e.target.value })}
                className="h-6 text-xs bg-background/50"
              />
            </div>
            <InspectorFieldRow label="Preset" icon={<SparklesIcon className="w-3 h-3" />}>
              <InspectorSegmentedGroup
                value={outroCard.preset || 'gradient'}
                onChange={(val) => updateOutro({ preset: val as 'minimal' | 'kinetic' | 'gradient' | 'cyber' })}
                options={[
                  { value: 'minimal', label: 'Dark' },
                  { value: 'kinetic', label: 'Glow' },
                  { value: 'gradient', label: 'Mesh' },
                  { value: 'cyber', label: 'Cyber' },
                ]}
              />
            </InspectorFieldRow>
          </div>
        )}
      </div>
    </InspectorSection>
  );
}
