/**
 * components/motion/inspector/controls/transform-controls.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The transform editor, split into Position / Rotation / Scale tabs so a narrow
 * inspector panel shows one visual control at a time instead of stacking three
 * pads vertically.
 *
 * Position and rotation pair a direct-manipulation surface with numeric fields;
 * scale gets a draggable bounding box, with a link toggle that edits all axes as
 * one. Tabs are uncontrolled on purpose: switching node selection keeps the tab
 * you were on.
 *
 * Rotation is passed in degrees here; the inspector owns the radians conversion
 * so the whole panel speaks one unit.
 */

import { useState } from 'react';
import { Move3dIcon, Rotate3dIcon, Scale3dIcon } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MotionVector3 } from '@/lib/motion/types';

import { PositionPad } from './position-pad';
import { RotationOrb } from './rotation-orb';
import { ScaleBox } from './scale-box';
import { VectorField } from './vector-field';

function toVector3(value: readonly number[]): MotionVector3 {
  return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
}

/** Flags a selection whose nodes disagree on this property. */
function MixedDot({ show }: { show?: boolean }) {
  if (!show) return null;
  return <span aria-hidden className="size-1 shrink-0 rounded-full bg-primary" />;
}

export type TransformControlsProps = {
  idPrefix?: string;
  position: MotionVector3;
  rotation: MotionVector3;
  scale: MotionVector3;
  mixed?: {
    position?: boolean;
    rotation?: boolean;
    scale?: boolean;
  };
  disabled?: boolean;
  onPositionChange: (value: MotionVector3) => void;
  onRotationChange: (value: MotionVector3) => void;
  onScaleChange: (value: MotionVector3) => void;
};

export function TransformControls({
  idPrefix = 'motion-transform',
  position,
  rotation,
  scale,
  mixed,
  disabled = false,
  onPositionChange,
  onRotationChange,
  onScaleChange,
}: TransformControlsProps) {
  const [scaleLinked, setScaleLinked] = useState(false);

  const changeScale = (next: readonly number[]) => {
    const vector = toVector3(next);
    if (!scaleLinked) {
      onScaleChange(vector);
      return;
    }
    const changed = vector.findIndex((axisValue, index) => axisValue !== scale[index]);
    const uniform = vector[changed === -1 ? 0 : changed] ?? scale[0];
    if (uniform !== undefined) onScaleChange([uniform, uniform, uniform]);
  };

  return (
    <Tabs defaultValue="position" className="gap-2">
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="position" className="h-7 flex-1 gap-1 px-1 text-[11px]">
          <Move3dIcon className="size-3" />
          Position
          <MixedDot show={mixed?.position} />
        </TabsTrigger>
        <TabsTrigger value="rotation" className="h-7 flex-1 gap-1 px-1 text-[11px]">
          <Rotate3dIcon className="size-3" />
          Rotation
          <MixedDot show={mixed?.rotation} />
        </TabsTrigger>
        <TabsTrigger value="scale" className="h-7 flex-1 gap-1 px-1 text-[11px]">
          <Scale3dIcon className="size-3" />
          Scale
          <MixedDot show={mixed?.scale} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="position" className="mt-1 flex flex-col gap-2">
        <PositionPad
          id={`${idPrefix}-position-pad`}
          value={position}
          disabled={disabled}
          onChange={onPositionChange}
        />
        <VectorField
          id={`${idPrefix}-position`}
          label="Position"
          value={position}
          mixed={mixed?.position}
          step={0.01}
          disabled={disabled}
          onChange={(next) => onPositionChange(toVector3(next))}
        />
      </TabsContent>

      <TabsContent value="rotation" className="mt-1 flex flex-col gap-2">
        <RotationOrb
          id={`${idPrefix}-rotation-orb`}
          value={rotation}
          disabled={disabled}
          onChange={onRotationChange}
        />
        <VectorField
          id={`${idPrefix}-rotation`}
          label="Rotation (degrees)"
          value={rotation}
          mixed={mixed?.rotation}
          step={1}
          disabled={disabled}
          onChange={(next) => onRotationChange(toVector3(next))}
        />
      </TabsContent>

      <TabsContent value="scale" className="mt-1 flex flex-col gap-2">
        <ScaleBox
          id={`${idPrefix}-scale-box`}
          value={scale}
          uniform={scaleLinked}
          onUniformChange={() => setScaleLinked((linked) => !linked)}
          disabled={disabled}
          onChange={changeScale}
        />
        <VectorField
          id={`${idPrefix}-scale`}
          label="Scale"
          value={scale}
          mixed={mixed?.scale}
          step={0.01}
          disabled={disabled}
          onChange={changeScale}
        />
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {scaleLinked
            ? 'Axes are linked — every handle scales the node uniformly.'
            : 'Drag an edge for one axis, a corner for two. Shift for uniform.'}
        </p>
      </TabsContent>
    </Tabs>
  );
}
