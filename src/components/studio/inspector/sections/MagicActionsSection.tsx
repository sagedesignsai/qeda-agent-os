/**
 * components/studio/inspector/sections/MagicActionsSection.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Agent actions & export section:
 *   - Autonomous Magic Draft (dead air trim & kinetic zoom synthesis)
 *   - AI Social Release Kit modal trigger
 *   - Quick Export MP4 / GIF buttons
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from 'react';
import {
  SparklesIcon,
  RefreshCwIcon,
  Share2Icon,
  DownloadIcon,
  VideoIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InspectorSection } from '../components/InspectorSection';

interface MagicActionsSectionProps {
  isProcessingDraft: boolean;
  isGeneratingSocialKit: boolean;
  onRunMagicDraft: () => void;
  onGenerateSocialKit: () => void;
  onExportVideo: (format: 'mp4' | 'gif') => void;
  defaultOpen?: boolean;
}

export function MagicActionsSection({
  isProcessingDraft,
  isGeneratingSocialKit,
  onRunMagicDraft,
  onGenerateSocialKit,
  onExportVideo,
  defaultOpen = true,
}: MagicActionsSectionProps) {
  return (
    <InspectorSection
      title="Magic Agent & Export"
      icon={<SparklesIcon className="w-3.5 h-3.5 text-indigo-400" />}
      badge="AGENT"
      defaultOpen={defaultOpen}
    >
      {/* ── Magic Draft CTA ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 p-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5">
        <Button
          type="button"
          size="sm"
          onClick={onRunMagicDraft}
          disabled={isProcessingDraft}
          className="w-full gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-sm font-medium h-8 text-xs cursor-pointer"
        >
          {isProcessingDraft ? (
            <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <SparklesIcon className="w-3.5 h-3.5" />
          )}
          <span>
            {isProcessingDraft ? 'Agent Processing...' : 'Re-Run Magic Draft'}
          </span>
        </Button>
        <span className="text-[10px] text-muted-foreground text-center leading-tight">
          Auto-cuts dead air & recalculates kinetic zoom curves
        </span>
      </div>

      {/* ── Social Kit CTA ──────────────────────────────────────────────────── */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onGenerateSocialKit}
        disabled={isGeneratingSocialKit}
        className="w-full gap-2 h-8 text-xs font-medium cursor-pointer"
      >
        {isGeneratingSocialKit ? (
          <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Share2Icon className="w-3.5 h-3.5 text-indigo-400" />
        )}
        <span>AI Social Release Kit</span>
      </Button>

      {/* ── Quick Export Actions ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onExportVideo('mp4')}
          className="h-7 text-xs gap-1.5 font-medium cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
        >
          <DownloadIcon className="w-3 h-3" />
          <span>Export MP4</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onExportVideo('gif')}
          className="h-7 text-xs gap-1.5 font-medium cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors"
        >
          <VideoIcon className="w-3 h-3" />
          <span>Export GIF</span>
        </Button>
      </div>
    </InspectorSection>
  );
}
