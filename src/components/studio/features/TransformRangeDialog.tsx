/**
 * components/studio/features/TransformRangeDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reference dialog for the extended transform ranges, opened from the
 * Inspector's "Advanced Transform…" action.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Move3dIcon } from 'lucide-react';
import { FeatureDialog } from './FeatureDialog';

interface TransformRangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clipName: string;
}

const ROWS = [
  {
    property: 'Position X / Y',
    range: '−2000 → 2000 px',
    note: 'Move clips far outside the frame for parallax and off-screen entrances.',
  },
  {
    property: 'Scale X / Y',
    range: '0.1× → 20×',
    note: 'Extreme punch-ins for detail shots; 0.1× for distant background plates.',
  },
  {
    property: 'Rotation',
    range: '−360° → 360°',
    note: 'Full rotations; keyframe two values for continuous spins.',
  },
];

export function TransformRangeDialog({
  open,
  onOpenChange,
  clipName,
}: TransformRangeDialogProps) {
  return (
    <FeatureDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Advanced Transform Ranges"
      description={clipName}
      icon={<Move3dIcon className="size-4 text-sky-400" />}
      helpText="The Inspector scrubs support production-scale transforms. Values outside the frame still render; use keyframes to animate them."
      width="sm"
      applyLabel="Done"
      onApply={() => onOpenChange(false)}
      testId="transform-range-dialog"
    >
      <dl className="space-y-2">
        {ROWS.map((row) => (
          <div
            key={row.property}
            className="rounded-md border border-border/40 bg-muted/20 px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[11px] font-semibold text-foreground">
                {row.property}
              </dt>
              <dd className="font-mono text-[10px] text-primary">{row.range}</dd>
            </div>
            <dd className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
              {row.note}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-[9px] text-muted-foreground">
        Tip: drag directly on the canvas to set position, then fine-tune with
        the scrub fields.
      </p>
    </FeatureDialog>
  );
}