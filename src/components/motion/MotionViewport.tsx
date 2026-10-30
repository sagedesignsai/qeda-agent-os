/**
 * components/motion/MotionViewport.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Preview controls and stage chrome for the document-driven 3D scene.
 */

import { useState } from 'react';
import {
  Grid2X2Icon,
  MinusIcon,
  MonitorIcon,
  PlusIcon,
  Rotate3DIcon,
} from 'lucide-react';

import { MotionSceneCanvas } from '@/components/motion/scene/MotionSceneCanvas';
import type {
  MotionCameraView,
  MotionStageColor,
} from '@/components/motion/scene/MotionSceneCanvas';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { motionStore, useMotionSnapshot } from '@/hooks/use-motion-store';
import type { MotionNode } from '@/lib/motion/types';

type StageTone = 'graphite' | 'slate' | 'paper';

const STAGE_COLORS: Record<StageTone, MotionStageColor> = {
  graphite: '#171a22',
  slate: '#39424f',
  paper: '#e1e4e9',
};

export function MotionViewport() {
  const { doc, selection } = useMotionSnapshot();
  const [viewMode, setViewMode] = useState<MotionCameraView>('perspective');
  const [stageTone, setStageTone] = useState<StageTone>('graphite');
  const [gridVisible, setGridVisible] = useState(true);
  const [zoom, setZoom] = useState(1);

  return (
    <section
      aria-label="Motion preview"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 px-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <MonitorIcon className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Preview</span>
          <Badge
            variant="outline"
            className="h-4 px-1.5 text-[9px] font-normal text-muted-foreground"
          >
            {doc.meta.output.width} × {doc.meta.output.height}
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (value === 'perspective' || value === 'front') {
                setViewMode(value);
              }
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Preview camera view"
            className="h-7"
          >
            <ToggleGroupItem
              value="perspective"
              aria-label="Perspective view"
              title="Perspective view"
            >
              <Rotate3DIcon />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="front"
              aria-label="Front view"
              title="Front view"
            >
              <MonitorIcon />
            </ToggleGroupItem>
          </ToggleGroup>

          <Button
            type="button"
            variant={gridVisible ? 'secondary' : 'ghost'}
            size="icon"
            className="size-7"
            aria-label={gridVisible ? 'Hide stage grid' : 'Show stage grid'}
            aria-pressed={gridVisible}
            title={gridVisible ? 'Hide stage grid' : 'Show stage grid'}
            onClick={() => setGridVisible((visible) => !visible)}
          >
            <Grid2X2Icon data-icon />
          </Button>

          <Select
            value={stageTone}
            onValueChange={(value) => {
              if (value === 'graphite' || value === 'slate' || value === 'paper') {
                setStageTone(value);
              }
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-[102px] text-[10px]"
              aria-label="Preview background"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="graphite">Graphite</SelectItem>
                <SelectItem value="slate">Slate</SelectItem>
                <SelectItem value="paper">Paper</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <div className="ml-1 flex items-center gap-0.5 border-l border-border/60 pl-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Zoom out"
              onClick={() =>
                setZoom((value) =>
                  Math.max(0.7, Math.round((value - 0.1) * 10) / 10),
                )
              }
            >
              <MinusIcon data-icon />
            </Button>
            <span className="w-9 text-center text-[10px] tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label="Zoom in"
              onClick={() =>
                setZoom((value) =>
                  Math.min(1.3, Math.round((value + 0.1) * 10) / 10),
                )
              }
            >
              <PlusIcon data-icon />
            </Button>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MotionSceneCanvas
          doc={doc}
          clock={motionStore.clock}
          viewMode={viewMode}
          stageColor={STAGE_COLORS[stageTone]}
          gridVisible={gridVisible}
          zoom={zoom}
          selectedNodeId={selection?.kind === 'node' ? selection.nodeId : undefined}
          onSelectNode={(nodeId) => motionStore.setSelection({ kind: 'node', nodeId })}
          onTransformNode={(nodeId, transform: MotionNode['transform']) => {
            motionStore.commit('Move scene object', [{ op: 'scene.node.update', nodeId, transform }]);
          }}
        />
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-md border border-border/70 bg-background/85 px-2 py-1 text-[10px] backdrop-blur">
          <span className="size-1.5 rounded-full bg-chart-3" />
          <span className="text-muted-foreground">3D scene</span>
          <span className="text-border">/</span>
          <span className="text-muted-foreground">Document scene</span>
        </div>
      </div>

      <div className="flex h-6 shrink-0 items-center justify-between border-t border-border/60 px-2.5 text-[10px] text-muted-foreground">
        <span>Live scene · scrubbing updates the preview</span>
        <span className="tabular-nums">
          {doc.meta.output.fps} fps · {doc.timeline.duration.toFixed(1)}s
        </span>
      </div>
    </section>
  );
}
