import { EASING_PRESETS } from '../easing';
import type { MotionClip, MotionEasing } from '../types';

const DEFAULT_EASING = EASING_PRESETS.easeInOut.value;

/** Build a clip with stable channel and key ids for authored template motion. */
export function showcaseClip(
  id: string,
  name: string,
  duration: number,
  targetId: string,
  channels: Array<{ property: string; keys: Array<{ time: number; value: number; easing?: MotionEasing }> }>,
): MotionClip {
  return {
    id,
    name,
    duration,
    channels: channels.map((channel, channelIndex) => ({
      id: `chn_${id}_${channelIndex}`,
      targetId,
      property: channel.property,
      keyframes: channel.keys.map((key, index) => ({
        id: `kf_${id}_${channelIndex}_${index}`,
        time: key.time,
        value: key.value,
        easing: key.easing ?? DEFAULT_EASING,
      })),
    })),
  };
}
