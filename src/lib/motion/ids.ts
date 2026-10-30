/**
 * lib/motion/ids.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Id generation, kept out of `ops.ts` so the op reducers stay pure.
 *
 * Ops take ids as parameters rather than minting them. That makes an op batch
 * replayable (undo/redo, agent transcripts, tests) — replaying the same ops must
 * produce the same document, which cannot happen if a reducer invents ids.
 */

import { nanoid } from 'nanoid';

export type MotionEntityKind =
  | 'doc'
  | 'track'
  | 'clip'
  | 'placement'
  | 'channel'
  | 'keyframe'
  | 'asset'
  | 'scene';

const PREFIX: Record<MotionEntityKind, string> = {
  doc: 'doc',
  track: 'trk',
  clip: 'clip',
  placement: 'plc',
  channel: 'chn',
  keyframe: 'kf',
  asset: 'asset',
  scene: 'scene',
};

export function createMotionId(kind: MotionEntityKind): string {
  return `${PREFIX[kind]}_${nanoid(8)}`;
}
