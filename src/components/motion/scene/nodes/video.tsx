/**
 * components/motion/scene/nodes/video.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Video screen binding. A plain `<video>` element feeds a `VideoTexture`; nothing
 * is decoded on the main thread by us.
 *
 * Playback is locked to the frame clock rather than left to the media element:
 * the export window paints at arbitrary timestamps, so a self-playing video would
 * drift out of the rendered file. While the clock is playing the element plays
 * natively (and is nudged back on drift); while it is paused — scrubbing, or every
 * exported frame — the element is seeked to the playhead.
 */

import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { LinearFilter, SRGBColorSpace, VideoTexture } from 'three';

import { motionAssetUrl } from '@/lib/motion/assets';
import type { MotionDocument, MotionNode } from '@/lib/motion/types';

import type { MotionNodeTimeSource } from '../renderer-registry';
import {
  boolProp,
  numberProp,
  stringProp,
  surfaceCoverUv,
  surfacePlaneSize,
  textureAspect,
} from './helpers';
import { MissingAssetRenderer } from './placeholders';

/** A paused seek must land on the requested instant, not a frame beside it. */
const PAUSED_SEEK_TOLERANCE = 1 / 120;
/** Visible drift before native playback is repositioned. */
const PLAYING_DRIFT_TOLERANCE = 0.25;

export function VideoScreenRenderer({
  node,
  document,
  clock,
}: {
  node: MotionNode;
  document: MotionDocument;
  clock: MotionNodeTimeSource;
}) {
  const gl = useThree((state) => state.gl);
  const width = numberProp(node, 'width', 3.46);
  const height = numberProp(node, 'height', 1.947);
  const fit = stringProp(node, 'fit', 'contain');
  const muted = boolProp(node, 'muted', true);
  const loop = boolProp(node, 'loop', true);
  const playbackRate = Math.max(0.1, numberProp(node, 'playbackRate', 1));
  const assetId = stringProp(node, 'assetId', '');
  const asset = document.assets.find((item) => item.id === assetId);
  const mediaSource = asset && asset.hash !== 'builtin'
    ? motionAssetUrl(document.meta.id, asset.id)
    : null;

  const [failedSource, setFailedSource] = useState<string | null>(null);
  // Created in an effect-free memo: an element is not a React child, only a source.
  const video = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const element = window.document.createElement('video');
    element.crossOrigin = 'anonymous';
    element.playsInline = true;
    element.preload = 'auto';
    return element;
  }, []);

  useEffect(() => {
    if (!video || !mediaSource) return undefined;
    const onError = () => setFailedSource(mediaSource);
    video.addEventListener('error', onError);
    video.src = mediaSource;
    video.load();
    return () => {
      video.removeEventListener('error', onError);
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [mediaSource, video]);

  useEffect(() => {
    if (!video) return;
    video.muted = muted;
    video.loop = loop;
    video.playbackRate = playbackRate;
  }, [loop, muted, playbackRate, video]);

  const texture = useMemo(() => {
    if (!video) return null;
    const next = new VideoTexture(video);
    next.colorSpace = SRGBColorSpace;
    next.magFilter = LinearFilter;
    next.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return next;
  }, [gl, video]);

  useEffect(() => () => texture?.dispose(), [texture]);

  const duration = asset?.duration ?? 0;

  useFrame(() => {
    if (!video || failedSource) return;
    let target = Math.max(0, clock.getTime()) * playbackRate;
    if (duration > 0) {
      target = loop
        ? target % duration
        : Math.min(target, Math.max(0, duration - 1e-3));
    }

    if (clock.isPlaying()) {
      // Native playback keeps decoding smooth; only correct visible drift.
      if (video.paused) void video.play().catch(() => undefined);
      if (Math.abs(video.currentTime - target) > PLAYING_DRIFT_TOLERANCE) {
        video.currentTime = target;
      }
      return;
    }

    if (!video.paused) video.pause();
    if (Math.abs(video.currentTime - target) > PAUSED_SEEK_TOLERANCE) {
      video.currentTime = target;
    }
  });

  // Import-time dimensions beat the element's, which arrives only with metadata.
  const aspect = asset?.width && asset.height
    ? asset.width / asset.height
    : textureAspect(texture);
  const plane = surfacePlaneSize(width, height, fit, aspect);
  const planeAspect = width / height;

  useEffect(() => {
    if (!texture) return;
    const uv = fit === 'cover' ? surfaceCoverUv(aspect, planeAspect) : null;
    const [repeatX, repeatY] = uv ? uv.repeat : [1, 1];
    const [offsetX, offsetY] = uv ? uv.offset : [0, 0];
    texture.repeat.set(repeatX, repeatY);
    texture.offset.set(offsetX, offsetY);
  }, [aspect, fit, planeAspect, texture]);

  if (!asset || !mediaSource || (failedSource !== null && failedSource === mediaSource)) {
    return <MissingAssetRenderer node={node} />;
  }

  return (
    <mesh>
      <planeGeometry args={[plane.width, plane.height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
