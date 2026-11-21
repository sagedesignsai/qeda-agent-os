/**
 * __tests__/studio-showcase-workflow.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * End-to-end (headless) showcase workflow:
 *
 *   legacy recording → import to media pool → create lanes → place clip →
 *   attach parameterized effect → animate intensity → add caption →
 *   switch to 9:16 → evaluate → build the render program
 *
 * This exercises the same pure editing functions the agent tools call, so a
 * regression in materialization, keyframing, or clip-effect rendering fails
 * here without needing Electron or a real video decoder.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from '@jest/globals';
import {
  addCaption,
  addClipEffect,
  addClipFromAsset,
  addEffectKeyframe,
  autoCreateTracks,
  importRecording,
  setProjectStyling,
} from '../lib/studio/editing';
import type { EffectDrawOp, TextDrawOp } from '../lib/studio/render/display-list';
import { IDLE_CAMERA } from '../lib/studio/render/camera';
import { buildFrameProgram } from '../lib/studio/render/program';
import { convertTakeToTimeline } from '../lib/studio/timeline/convert';
import { evaluateEditorTimeline } from '../lib/studio/timeline/evaluate';
import { DEFAULT_STUDIO_STYLING, type StudioTake } from '../lib/studio-types';

function recordingTake(): StudioTake {
  return {
    id: 'take-showcase-workflow',
    projectId: 'project-1',
    title: 'Feature walkthrough',
    description: null,
    sourceType: 'screen',
    sourceName: null,
    durationMs: 6000,
    videoPath: '/tmp/recording.mp4',
    audioPath: '/tmp/recording.wav',
    mouseEventsPath: null,
    cuts: [],
    zooms: [],
    captions: [],
    effects: [],
    overlays: [],
    styling: DEFAULT_STUDIO_STYLING,
    socialKit: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('showcase workflow', () => {
  it('imports a source, edits a clip, and renders its effect and caption', () => {
    // 1. Import the screen recording as reusable source material.
    const imported = importRecording(recordingTake(), {
      videoPath: '/tmp/recording.mp4',
      title: 'Feature walkthrough',
      durationMs: 6000,
      width: 1920,
      height: 1080,
      hasAudio: true,
    });
    expect(imported.error).toBeUndefined();
    expect(imported.asset).toBeDefined();
    const asset = imported.asset!;

    // 2. Ensure the video and audio lanes exist, then place the asset.
    const lanes = autoCreateTracks(imported.take, { withAudio: true });
    expect(lanes.audioTrackId).toBeDefined();

    const placed = addClipFromAsset(lanes.take, {
      assetId: asset.id,
      trackId: lanes.videoTrackId,
      startMs: 2000,
      durationMs: 3000,
    });
    expect(placed.error).toBeUndefined();
    const clipId = placed.clipId!;

    // 3. Attach a parameterized effect and animate its intensity.
    const withEffect = addClipEffect(placed.take, clipId, {
      type: 'spotlight',
      intensity: 0.35,
      params: { radius: 0.35, feather: 40 },
    });
    expect(withEffect.error).toBeUndefined();
    const effectId = withEffect.effect!.id;

    const keyframeStart = addEffectKeyframe(withEffect.take, clipId, effectId, {
      timeMs: 0,
      intensity: 0.2,
    });
    const keyframeEnd = addEffectKeyframe(keyframeStart.take, clipId, effectId, {
      timeMs: 3000,
      intensity: 0.9,
    });

    // 4. Add a timed caption, then make the project a vertical showcase.
    const withCaption = addCaption(keyframeEnd.take, {
      startMs: 2500,
      endMs: 3500,
      text: 'Meet the new dashboard',
    });
    expect(withCaption.error).toBeUndefined();

    const styled = setProjectStyling(withCaption.take, {
      aspectRatio: '9:16',
      canvasMode: 'showcase',
      showCaptions: true,
      captionStyle: 'badge',
    });
    expect(styled.error).toBeUndefined();

    // 5. Evaluate the timeline and build the same program the renderer paints.
    const timeline = convertTakeToTimeline(styled.take);
    const compTimeMs = 3000;
    const evaluatedFrame = evaluateEditorTimeline(timeline, compTimeMs);

    const program = buildFrameProgram({
      width: 720,
      height: 1280,
      compTimeMs,
      styling: styled.styling,
      evaluatedFrame,
      camera: IDLE_CAMERA,
      assets: {
        byAssetId: new Map([[asset.id, { width: 1920, height: 1080 }]]),
        recordedVideo: { width: 1920, height: 1080 },
      },
      includeMotionCards: false,
    });

    const effectOp = program.ops.find(
      (op): op is EffectDrawOp =>
        op.kind === 'effect' && op.id === `clip-effect:${clipId}:${effectId}`,
    );
    expect(effectOp).toBeDefined();
    expect(effectOp!.effectType).toBe('spotlight');
    expect(effectOp!.params?.radius).toBeCloseTo(0.35);
    expect(effectOp!.rect?.width).toBeGreaterThan(0);
    // 1000 ms into the 3000 ms clip: between the 0.2 start and 0.9 end.
    expect(effectOp!.intensity).toBeGreaterThan(0.2);
    expect(effectOp!.intensity).toBeLessThan(0.9);
    expect(effectOp!.clip).toBe('content');

    const textOp = program.ops.find(
      (op): op is TextDrawOp =>
        op.kind === 'text' && op.layout.mode === 'caption',
    );
    expect(textOp).toBeDefined();
    if (!textOp || textOp.layout.mode !== 'caption') {
      throw new Error('Expected a caption text op');
    }
    expect(textOp.layout.caption.text).toBe('Meet the new dashboard');
    expect(textOp.layout.style).toBe('badge');

    // The vertical showcase keeps the framed chrome in the program.
    expect(program.ops.some((op) => op.kind === 'chrome')).toBe(true);
  });
});
