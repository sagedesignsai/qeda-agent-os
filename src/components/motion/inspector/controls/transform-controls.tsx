/**
 * components/motion/inspector/controls/transform-controls.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The transform editor: a cartesian pad for position, an orbit sphere for
 * rotation, and a scale row that can be linked to edit all axes as one. Every
 * control still exposes numeric fields, because GUI aiming and exact entry are
 * complementary rather than competing.
 *
 * Rotation is passed in degrees here; the inspector owns the radians conversion
 * so the whole panel speaks one unit.
 */

import { useState } from 'react';
import { LinkIcon, UnlinkIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { MotionVector3 } from '@/lib/motion/types';

import { PositionPad } from './position-pad';
import { RotationOrb } from './rotation-orb';
import { VectorField } from './vector-field';

function toVector3(value: readonly number[]): MotionVector3 {
  return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
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
    <div className="flex flex-col gap-3">
      <section aria-label="Position transform" className="flex flex-col gap-1.5">
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
      </section>

      <section aria-label="Rotation transform" className="flex flex-col gap-1.5">
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
      </section>

      <section aria-label="Scale transform">
        <VectorField
          id={`${idPrefix}-scale`}
          label="Scale"
          value={scale}
          mixed={mixed?.scale}
          step={0.01}
          disabled={disabled}
          onChange={changeScale}
          action={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-4"
              aria-pressed={scaleLinked}
              aria-label={scaleLinked ? 'Unlink scale axes' : 'Link scale axes'}
              title={scaleLinked ? 'Unlink scale axes' : 'Link scale axes'}
              disabled={disabled}
              onClick={() => setScaleLinked((linked) => !linked)}
            >
              {scaleLinked ? <LinkIcon className="size-3" /> : <UnlinkIcon className="size-3" />}
            </Button>
          }
        />
      </section>
    </div>
  );
}
