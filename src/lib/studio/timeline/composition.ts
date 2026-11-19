import type {
  StudioComposition,
  StudioCompositionDocument,
  StudioCompositionLayer,
  StudioCompositionVideoLayer,
  StudioTake,
  TimelineClip,
  TimelineTrack,
} from '../types';
import {
  convertTakeToTracks,
  extractCaptionsFromTracks,
  extractCutsFromTracks,
  extractEffectsFromTracks,
  extractOverlaysFromTracks,
  extractZoomsFromTracks,
} from './convert';
import { compositionDurationMs } from './ripple';
import { parseStudioCompositionDocument } from '../composition';

const COMPOSITION_EFFECTS_TRACK = 'composition:effects';

function takeForLayer(layer: StudioCompositionVideoLayer): StudioTake | null {
  const presentation = layer.takePresentation;
  if (!presentation) return null;
  return {
    id: layer.id,
    projectId: null,
    title: layer.name,
    description: null,
    sourceType: 'screen',
    sourceName: null,
    durationMs: layer.sourceDurationMs,
    videoPath: '',
    audioPath: null,
    mouseEventsPath: null,
    cuts: presentation.cuts,
    zooms: presentation.zooms,
    captions: presentation.captions,
    effects: presentation.effects,
    overlays: presentation.overlays,
    videoCrop: presentation.videoCrop,
    styling: presentation.styling,
    socialKit: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

function layerTrackId(layerId: string, type: TimelineTrack['type']): string {
  return `${layerId}:${type}`;
}

function tagLayerTrack(
  track: TimelineTrack,
  layer: StudioCompositionVideoLayer,
): TimelineTrack {
  const id = layerTrackId(layer.id, track.type);
  return {
    ...track,
    id,
    locked: layer.locked ?? track.locked,
    visible: layer.visible ?? track.visible,
    name: track.type === 'video' ? track.name : `${track.name} · ${layer.id}`,
    muted: track.type === 'audio' ? false : track.muted,
    clips: track.clips.map((clip) => ({
      ...clip,
      trackId: id,
      payload: { ...clip.payload, compositionLayerId: layer.id },
    })),
  };
}

function videoTrackForLayer(layer: StudioCompositionVideoLayer): TimelineTrack {
  const id = layerTrackId(layer.id, 'video');
  const durationMs = layer.endMs - layer.startMs;
  const clip: TimelineClip = {
    id: `${layer.id}:source`,
    trackId: id,
    name: layer.name,
    startMs: layer.startMs,
    durationMs,
    sourceStartMs: layer.sourceInMs,
    sourceDurationMs: durationMs,
    color: '#334155',
    payload: { compositionLayerId: layer.id },
  };
  return {
    id,
    type: 'video',
    name: layer.name,
    locked: layer.locked ?? false,
    visible: layer.visible ?? true,
    clips: [clip],
  };
}

export function convertStudioCompositionToTracks(
  composition: StudioComposition,
): TimelineTrack[] {
  const tracks: TimelineTrack[] = [];
  for (const layer of composition.document.layers) {
    if (layer.kind === 'text') {
      const id = layerTrackId(layer.id, 'captions');
      tracks.push({
        id,
        type: 'captions',
        name: layer.name,
        locked: layer.locked ?? false,
        visible: layer.visible ?? true,
        clips: [
          {
            id: layer.id,
            trackId: id,
            name: layer.text,
            startMs: layer.startMs,
            durationMs: layer.endMs - layer.startMs,
            sourceStartMs: layer.startMs,
            sourceDurationMs: layer.endMs - layer.startMs,
            color: '#14b8a6',
            payload: {
              text: layer.text,
              compositionLayerId: layer.id,
            },
          },
        ],
      });
      continue;
    }
    if (layer.kind === 'image') {
      const id = layerTrackId(layer.id, 'overlays');
      tracks.push({
        id,
        type: 'overlays',
        name: layer.name,
        locked: layer.locked ?? false,
        visible: layer.visible ?? true,
        clips: [
          {
            id: layer.id,
            trackId: id,
            name: layer.name,
            startMs: layer.startMs,
            durationMs: layer.endMs - layer.startMs,
            sourceStartMs: 0,
            sourceDurationMs: layer.endMs - layer.startMs,
            color: '#f59e0b',
            payload: {
              kind: 'image',
              sourceId: layer.sourceId,
              x: layer.layouts[composition.document.aspectRatio].x,
              y: layer.layouts[composition.document.aspectRatio].y,
              widthPct: layer.layouts[composition.document.aspectRatio].width,
              opacity: layer.opacity,
              cornerRadius:
                layer.layouts[composition.document.aspectRatio].cornerRadius,
              compositionLayerId: layer.id,
            },
          },
        ],
      });
      continue;
    }

    const take = takeForLayer(layer);
    if (!take) {
      tracks.push(videoTrackForLayer(layer));
      continue;
    }

    const tracksForTake = convertTakeToTracks(take).map((track) => {
      const tagged = tagLayerTrack(track, layer);
      return {
        ...tagged,
        muted:
          tagged.type === 'audio'
            ? composition.document.audioSourceLayerId !== layer.id
            : tagged.muted,
        clips: tagged.clips.map((clip) => ({
          ...clip,
          startMs: clip.startMs + layer.startMs,
        })),
      };
    });
    tracks.push(...tracksForTake);
  }

  const compositionEffects = composition.document.effects ?? [];
  tracks.push({
    id: COMPOSITION_EFFECTS_TRACK,
    type: 'effects',
    name: 'Composition effects',
    locked: false,
    visible: true,
    clips: compositionEffects.map((effect) => ({
      id: effect.id,
      trackId: COMPOSITION_EFFECTS_TRACK,
      name: effect.type,
      startMs: effect.startMs,
      durationMs: effect.endMs - effect.startMs,
      sourceStartMs: effect.startMs,
      sourceDurationMs: effect.endMs - effect.startMs,
      color: '#8b5cf6',
      payload: { effectType: effect.type, intensity: effect.intensity },
    })),
  });
  return tracks;
}

function layerStartFromTracks(
  tracks: TimelineTrack[],
  layer: StudioCompositionVideoLayer,
): number {
  const videoTrack = tracks.find(
    (track) => track.id === layerTrackId(layer.id, 'video'),
  );
  return videoTrack?.clips.length
    ? Math.min(...videoTrack.clips.map((clip) => clip.startMs))
    : layer.startMs;
}

function localizeLayerTracks(
  tracks: TimelineTrack[],
  layer: StudioCompositionVideoLayer,
  layerStartMs: number,
): TimelineTrack[] {
  const prefix = `${layer.id}:`;
  return tracks
    .filter((track) => track.id.startsWith(prefix))
    .map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({
        ...clip,
        startMs: clip.startMs - layerStartMs,
      })),
    }));
}

function takePresentationFromTracks(
  layer: StudioCompositionVideoLayer,
  tracks: TimelineTrack[],
  layerStartMs: number,
) {
  const previous = layer.takePresentation;
  if (!previous) return undefined;
  const localTracks = localizeLayerTracks(tracks, layer, layerStartMs);
  const videoTrack = localTracks.filter((track) => track.type === 'video');
  const cuts = extractCutsFromTracks(videoTrack, layer.sourceDurationMs);
  const captionsById = new Map(
    previous.captions.map((caption) => [caption.id, caption]),
  );
  const captions = extractCaptionsFromTracks(localTracks, cuts).map(
    (caption) => ({
      ...caption,
      words: captionsById.get(caption.id)?.words,
    }),
  );
  return {
    ...previous,
    cuts,
    zooms: extractZoomsFromTracks(localTracks, cuts),
    captions,
    effects: extractEffectsFromTracks(localTracks, cuts),
    overlays: extractOverlaysFromTracks(localTracks, cuts),
  };
}

function updateLayerFromTimeline(
  layer: StudioCompositionLayer,
  tracks: TimelineTrack[],
  aspectRatio: StudioCompositionDocument['aspectRatio'],
): StudioCompositionLayer {
  if (layer.kind === 'text') {
    const track = tracks.find(
      (candidate) => candidate.id === layerTrackId(layer.id, 'captions'),
    );
    const clip = track?.clips.find((candidate) => candidate.id === layer.id);
    return clip && track
      ? {
          ...layer,
          name: clip.name,
          text: clip.payload?.text ?? clip.name,
          startMs: clip.startMs,
          endMs: clip.startMs + clip.durationMs,
          visible: track.visible,
          locked: track.locked,
        }
      : layer;
  }
  if (layer.kind === 'image') {
    const track = tracks.find(
      (candidate) => candidate.id === layerTrackId(layer.id, 'overlays'),
    );
    const clip = track?.clips.find((candidate) => candidate.id === layer.id);
    if (!clip || !track) return layer;
    const payload = clip.payload;
    const oldLayout = layer.layouts[aspectRatio];
    return {
      ...layer,
      startMs: clip.startMs,
      endMs: clip.startMs + clip.durationMs,
      opacity: payload?.opacity ?? layer.opacity,
      visible: track.visible,
      locked: track.locked,
      layouts: {
        ...layer.layouts,
        [aspectRatio]: {
          ...oldLayout,
          x: payload?.x ?? oldLayout.x,
          y: payload?.y ?? oldLayout.y,
          width: payload?.widthPct ?? oldLayout.width,
          cornerRadius: payload?.cornerRadius ?? oldLayout.cornerRadius,
        },
      },
    };
  }

  const layerStartMs = layerStartFromTracks(tracks, layer);
  const videoTrack = tracks.find(
    (track) => track.id === layerTrackId(layer.id, 'video'),
  );
  if (!layer.takePresentation) {
    const clip = videoTrack?.clips[0];
    return clip && videoTrack
      ? {
          ...layer,
          startMs: clip.startMs,
          endMs: clip.startMs + clip.durationMs,
          sourceInMs: clip.sourceStartMs,
          visible: videoTrack.visible,
          locked: videoTrack.locked,
        }
      : layer;
  }

  const takePresentation = takePresentationFromTracks(
    layer,
    tracks,
    layerStartMs,
  );
  if (!takePresentation) return layer;
  const durationMs = compositionDurationMs(
    layer.sourceDurationMs,
    takePresentation.cuts,
  );
  return {
    ...layer,
    startMs: layerStartMs,
    takePresentation,
    visible: videoTrack?.visible ?? layer.visible,
    locked: videoTrack?.locked ?? layer.locked,
    endMs: layerStartMs + durationMs,
  };
}

export function updateStudioCompositionFromTracks(
  composition: StudioComposition,
  tracks: TimelineTrack[],
): StudioCompositionDocument {
  const remainingLayers = composition.document.layers.filter((layer) => {
    const trackId = layerTrackId(
      layer.id,
      layer.kind === 'video'
        ? 'video'
        : layer.kind === 'image'
          ? 'overlays'
          : 'captions',
    );
    const track = tracks.find((candidate) => candidate.id === trackId);
    return !track || track.clips.length > 0;
  });
  const layers = remainingLayers.map((layer) =>
    updateLayerFromTimeline(layer, tracks, composition.document.aspectRatio),
  );
  const rootEffectsTrack = tracks.find(
    (track) => track.id === COMPOSITION_EFFECTS_TRACK,
  );
  const effects = rootEffectsTrack
    ? extractEffectsFromTracks([rootEffectsTrack])
    : (composition.document.effects ?? []);
  const durationMs = Math.max(
    1,
    ...layers.map((layer) => layer.endMs),
    ...effects.map((effect) => effect.endMs),
  );
  const hasAudioTracks = tracks.some((track) => track.type === 'audio');
  const requestedAudioLayerId = hasAudioTracks
    ? (tracks
        .filter((track) => track.type === 'audio' && !track.muted)
        .flatMap((track) => track.clips)
        .map((clip) => clip.payload?.compositionLayerId)
        .find((layerId) =>
          layers.some(
            (layer) => layer.kind === 'video' && layer.id === layerId,
          ),
        ) ?? null)
    : composition.document.audioSourceLayerId;
  const audioSourceLayerId = hasAudioTracks
    ? requestedAudioLayerId
    : layers.some(
          (layer) =>
            layer.kind === 'video' &&
            layer.id === composition.document.audioSourceLayerId,
        )
      ? composition.document.audioSourceLayerId
      : (layers.find((layer) => layer.kind === 'video')?.id ?? null);
  return parseStudioCompositionDocument({
    ...composition.document,
    durationMs,
    audioSourceLayerId,
    layers: layers.map((layer) => ({
      ...layer,
      endMs: Math.min(layer.endMs, durationMs),
    })),
    effects,
  });
}
