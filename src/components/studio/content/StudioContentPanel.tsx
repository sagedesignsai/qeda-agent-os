/**
 * components/studio/content/StudioContentPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CapCut-inspired left library dock for Studio Editor:
 *   - Tab switcher: Media, Text, Effects, Audio
 *   - Direct 1-click "+" and drag-and-drop ingestion into Timeline tracks
 *   - Collapsible panel with smooth transition
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState } from 'react';
import {
  FilmIcon,
  TypeIcon,
  SparklesIcon,
  MusicIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StudioMediaTab } from './tabs/StudioMediaTab';
import { StudioTextTab } from './tabs/StudioTextTab';
import { StudioEffectsTab } from './tabs/StudioEffectsTab';
import { StudioAudioTab } from './tabs/StudioAudioTab';
import type { ContentItemPayload } from './items/ContentCardItem';
import type { StudioTakeSummary } from '@/lib/studio-types';

export type ContentTab = 'media' | 'text' | 'effects' | 'audio';

interface StudioContentPanelProps {
  takes: StudioTakeSummary[];
  onAddClip: (clip: ContentItemPayload) => void;
  onNewRecording?: () => void;
  projectId?: string | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function StudioContentPanel({
  takes,
  onAddClip,
  onNewRecording,
  projectId,
  isCollapsed = false,
  onToggleCollapse,
}: StudioContentPanelProps) {
  const [activeTab, setActiveTab] = useState<ContentTab>('media');

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-border/40 bg-card/20 shrink-0 flex flex-col items-center py-3 gap-3">
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Expand content library"
          >
            <PanelLeftOpenIcon className="w-4 h-4" />
          </Button>
        )}
        <div className="w-6 h-px bg-border/40 my-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setActiveTab('media');
            onToggleCollapse?.();
          }}
          className={`h-8 w-8 ${activeTab === 'media' ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
          title="Media"
        >
          <FilmIcon className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setActiveTab('text');
            onToggleCollapse?.();
          }}
          className={`h-8 w-8 ${activeTab === 'text' ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
          title="Text"
        >
          <TypeIcon className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setActiveTab('effects');
            onToggleCollapse?.();
          }}
          className={`h-8 w-8 ${activeTab === 'effects' ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
          title="Effects"
        >
          <SparklesIcon className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setActiveTab('audio');
            onToggleCollapse?.();
          }}
          className={`h-8 w-8 ${activeTab === 'audio' ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
          title="Audio"
        >
          <MusicIcon className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full bg-card/40 border-r border-border/30 flex flex-col h-full select-none">
      {/* ── Compact Tab Header (Dense Layout with Transitions) ─────────────────── */}
      <div className="h-9 border-b border-border/40 px-2 flex items-center justify-between gap-0.5 bg-background/20 shrink-0">
        <div className="flex items-center gap-0.5">
          <Button
            variant={activeTab === 'media' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('media')}
            className={`h-6 px-2 text-xs gap-1 font-medium transition-all duration-200 ${
              activeTab === 'media'
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <FilmIcon className="w-3 h-3" />
            <span className="hidden sm:inline">Media</span>
          </Button>

          <Button
            variant={activeTab === 'text' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('text')}
            className={`h-6 px-2 text-xs gap-1 font-medium transition-all duration-200 ${
              activeTab === 'text'
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <TypeIcon className="w-3 h-3" />
            <span className="hidden sm:inline">Text</span>
          </Button>

          <Button
            variant={activeTab === 'effects' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('effects')}
            className={`h-6 px-2 text-xs gap-1 font-medium transition-all duration-200 ${
              activeTab === 'effects'
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <SparklesIcon className="w-3 h-3" />
            <span className="hidden sm:inline">Effects</span>
          </Button>

          <Button
            variant={activeTab === 'audio' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('audio')}
            className={`h-6 px-2 text-xs gap-1 font-medium transition-all duration-200 ${
              activeTab === 'audio'
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <MusicIcon className="w-3 h-3" />
            <span className="hidden sm:inline">Audio</span>
          </Button>
        </div>

        {/* Collapse Button */}
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-6 w-6 text-muted-foreground hover:text-foreground ml-auto"
            title="Collapse content library"
          >
            <PanelLeftCloseIcon className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* ── Active Tab Content (Compact) ───────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden p-2 min-h-0">
        {activeTab === 'media' && (
          <StudioMediaTab
            takes={takes}
            onAddClip={onAddClip}
            onNewRecording={onNewRecording}
            projectId={projectId}
          />
        )}
        {activeTab === 'text' && <StudioTextTab onAddClip={onAddClip} />}
        {activeTab === 'effects' && <StudioEffectsTab onAddClip={onAddClip} />}
        {activeTab === 'audio' && (
          <StudioAudioTab onAddClip={onAddClip} projectId={projectId} />
        )}
      </div>
    </div>
  );
}
