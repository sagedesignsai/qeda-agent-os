/**
 * lib/studio/scenes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Scene model for Studio.
 *
 * A scene is a timeline scope: it owns its tracks, cuts, zooms, captions,
 * effects, overlays and composition duration. Project-level data (media pool,
 * canvas styling, aspect ratio) stays on `StudioTake`.
 *
 * Existing projects have no `scenes` array. They behave as one implicit scene
 * built from the take's legacy fields, so opening an old project is lossless and
 * requires no migration prompt. The first scene operation materializes the
 * array.
 *
 * Pure and renderer-free so the editor, the export renderer and tests share the
 * same resolution rules.
 */

import type {
  StudioCut,
  StudioOverlay,
  StudioScene,
  StudioSequence,
  StudioSequenceItem,
  StudioTake,
  StudioTrack,
  StudioZoom,
} from './types';
import { compositionDurationMs, normalizeCuts } from './timeline/ripple';

export const STUDIO_MAIN_SCENE_ID = 'scene-main';

export interface StudioResolvedSequence {
  items: StudioSequenceItem[];
  durationMs: number;
}

export interface StudioSequenceLayer {
  item: StudioSequenceItem;
  scene: StudioScene;
  /** Time inside the scene, clamped to its duration. */
  sceneTimeMs: number;
}

export interface StudioSequenceFrame {
  layers: StudioSequenceLayer[];
  transition?: {
    type: 'crossfade' | 'dip';
    progress: number;
    color?: string;
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function maxClipEndMs(tracks: readonly StudioTrack[] | undefined): number {
  if (!tracks || tracks.length === 0) return 0;
  let end = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.startMs + clip.durationMs);
    }
  }
  return end;
}

/** Composition duration implied by a scene's clips. */
export function studioSceneContentDurationMs(
  tracks: readonly StudioTrack[] | undefined,
  fallbackMs: number,
): number {
  const clipEnd = maxClipEndMs(tracks);
  if (clipEnd > 0) return Math.max(1000, clipEnd);
  return Math.max(1000, Math.round(fallbackMs) || 1000);
}

/** Build the implicit main scene for a project that predates scenes. */
export function studioSceneFromTake(
  take: StudioTake,
  id: string = STUDIO_MAIN_SCENE_ID,
  name = 'Scene 1',
): StudioScene {
  const sourceDuration = Math.max(0, take.durationMs);
  const compositionDuration = take.tracks === undefined
    ? compositionDurationMs(
        sourceDuration,
        normalizeCuts(take.cuts ?? [], sourceDuration),
      )
    : studioSceneContentDurationMs(take.tracks, sourceDuration);
  return {
    id,
    name,
    durationMs: compositionDuration,
    tracks: take.tracks,
    videoPath: take.videoPath || undefined,
    videoCrop: take.videoCrop,
    cuts: take.cuts ?? [],
    zooms: take.zooms ?? [],
    captions: take.captions ?? [],
    effects: take.effects ?? [],
    overlays: take.overlays ?? [],
  };
}

/** All scenes in a project, materializing the implicit single scene. */
export function getStudioScenes(take: StudioTake): StudioScene[] {
  if (take.scenes && take.scenes.length > 0) return take.scenes;
  return [studioSceneFromTake(take)];
}

export function getActiveStudioScene(take: StudioTake): StudioScene {
  const scenes = getStudioScenes(take);
  return scenes.find((scene) => scene.id === take.activeSceneId) ?? scenes[0];
}

export function getStudioSceneIndex(take: StudioTake, sceneId?: string): number {
  const scenes = getStudioScenes(take);
  const index = scenes.findIndex(
    (scene) => scene.id === (sceneId ?? take.activeSceneId),
  );
  return index >= 0 ? index : 0;
}

/**
 * Project a scene's content onto the take shape read by the canvas, inspector,
 * timeline and export renderer. Project-level fields stay untouched so the
 * recording URL, media pool and brand survive scene switches.
 */
export function projectStudioScene(
  take: StudioTake,
  scene: StudioScene,
): StudioTake {
  return {
    ...take,
    activeSceneId: scene.id,
    // Scene content uses its own source recording. Additional scenes have no
    // recording; they draw from the shared media pool via tracks.
    videoPath: scene.videoPath ?? '',
    audioPath: scene.videoPath ? take.audioPath : null,
    cuts: scene.cuts ?? [],
    zooms: scene.zooms ?? [],
    captions: scene.captions ?? [],
    effects: scene.effects ?? [],
    overlays: scene.overlays ?? [],
    videoCrop: scene.videoCrop,
    tracks: scene.tracks,
  };
}

export interface StudioSceneContentPatch {
  tracks?: StudioTrack[];
  cuts?: StudioCut[];
  zooms?: StudioZoom[];
  captions?: StudioTake['captions'];
  effects?: StudioTake['effects'];
  overlays?: StudioOverlay[];
  durationMs?: number;
}

/**
 * Patch one scene inside the project. Returns the same take when the project
 * has no materialized scene array, which keeps legacy edits on the existing
 * single-timeline path.
 */
export function updateStudioScene(
  take: StudioTake,
  sceneId: string,
  patch: StudioSceneContentPatch,
): StudioTake {
  if (!take.scenes || take.scenes.length === 0) return take;
  let changed = false;
  const scenes = take.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene;
    changed = true;
    const tracks = patch.tracks ?? scene.tracks;
    return {
      ...scene,
      ...patch,
      tracks,
      durationMs:
        patch.durationMs ??
        (patch.tracks
          ? studioSceneContentDurationMs(tracks, scene.durationMs)
          : scene.durationMs),
    };
  });
  return changed ? { ...take, scenes } : take;
}

/** Create a scene with sensible defaults for the multi-track editor. */
export function createStudioScene(
  partial: Partial<StudioScene> & Pick<StudioScene, 'name'>,
): StudioScene {
  return {
    id: partial.id ?? createId('scene'),
    name: partial.name,
    durationMs: partial.durationMs ?? 5000,
    tracks: partial.tracks ?? [],
    videoPath: partial.videoPath,
    videoCrop: partial.videoCrop,
    cuts: partial.cuts ?? [],
    zooms: partial.zooms ?? [],
    captions: partial.captions ?? [],
    effects: partial.effects ?? [],
    overlays: partial.overlays ?? [],
  };
}

/** Deep-clone a scene and give every track, clip and transition a fresh id. */
export function cloneStudioScene(
  source: StudioScene,
  name: string,
): StudioScene {
  const clone = JSON.parse(JSON.stringify(source)) as StudioScene;
  const trackIds = new Map<string, string>();
  const clipIds = new Map<string, string>();
  const tracks = (clone.tracks ?? []).map((track) => {
    const trackId = createId('layer');
    trackIds.set(track.id, trackId);
    return {
      ...track,
      id: trackId,
      clips: track.clips.map((clip) => {
        const clipId = createId('clip');
        clipIds.set(clip.id, clipId);
        return { ...clip, id: clipId, trackId };
      }),
    };
  });
  for (const track of tracks) {
    for (const clip of track.clips) {
      const payload = clip.payload;
      if (!payload) continue;
      if (payload.fromClipId && clipIds.has(payload.fromClipId)) {
        payload.fromClipId = clipIds.get(payload.fromClipId);
      }
      if (payload.toClipId && clipIds.has(payload.toClipId)) {
        payload.toClipId = clipIds.get(payload.toClipId);
      }
      if (payload.targetClipId && clipIds.has(payload.targetClipId)) {
        payload.targetClipId = clipIds.get(payload.targetClipId);
      }
    }
  }
  return {
    ...clone,
    id: createId('scene'),
    name,
    tracks,
    cuts: clone.cuts ?? [],
    zooms: clone.zooms ?? [],
    captions: clone.captions ?? [],
    effects: clone.effects ?? [],
    overlays: clone.overlays ?? [],
  };
}

/** True when the scene has no user content yet (used for empty states). */
export function sceneIsEmpty(scene: StudioScene): boolean {
  return (scene.tracks ?? []).every((track) => track.clips.length === 0);
}

// ── Scene templates ──────────────────────────────────────────────────────────

export type StudioSceneTemplateId =
  | 'blank'
  | 'intro'
  | 'outro'
  | 'comparison';

export const STUDIO_SCENE_TEMPLATES: ReadonlyArray<{
  id: StudioSceneTemplateId;
  title: string;
  description: string;
  durationMs: number;
}> = [
  {
    id: 'blank',
    title: 'Blank scene',
    description: 'An empty canvas ready for media.',
    durationMs: 5000,
  },
  {
    id: 'intro',
    title: 'Intro',
    description: 'A title and subtitle bookend.',
    durationMs: 3000,
  },
  {
    id: 'outro',
    title: 'Outro',
    description: 'A closing title with a call to action.',
    durationMs: 3000,
  },
  {
    id: 'comparison',
    title: 'Comparison',
    description: 'Two side-by-side video lanes with labels.',
    durationMs: 6000,
  },
];

function titleTextClip(options: {
  trackId: string;
  text: string;
  startMs: number;
  durationMs: number;
  y: number;
  fontSize: number;
  color: string;
  x?: number;
  bold?: boolean;
}): StudioTrack['clips'][number] {
  return {
    id: createId('clip'),
    trackId: options.trackId,
    itemType: 'text',
    name: options.text,
    startMs: options.startMs,
    durationMs: options.durationMs,
    sourceInMs: 0,
    sourceDurationMs: options.durationMs,
    color: '#14b8a6',
    payload: {
      text: options.text,
      x: options.x ?? 0.5,
      y: options.y,
      textStyle: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: options.fontSize,
        color: options.color,
        align: 'center',
      },
      enterAnimation: { type: 'fade', durationMs: 420 },
      exitAnimation: { type: 'fade', durationMs: 420 },
    },
  };
}

function textTrack(clips: StudioTrack['clips']): StudioTrack {
  const trackId = createId('layer');
  return {
    id: trackId,
    name: 'Text & Captions',
    type: 'captions',
    locked: false,
    visible: true,
    clips: clips.map((clip) => ({ ...clip, trackId })),
  };
}

/** Build a starter scene from one of the built-in templates. */
export function createStudioSceneFromTemplate(
  templateId: StudioSceneTemplateId,
  name: string,
): StudioScene {
  const durationMs =
    STUDIO_SCENE_TEMPLATES.find((template) => template.id === templateId)
      ?.durationMs ?? 5000;

  if (templateId === 'blank') {
    return createStudioScene({ name, durationMs });
  }

  if (templateId === 'comparison') {
    const leftTrackId = createId('layer');
    const rightTrackId = createId('layer');
    const leftLabel = titleTextClip({
      trackId: leftTrackId,
      text: 'Left',
      startMs: 200,
      durationMs: Math.max(800, durationMs - 200),
      y: 0.2,
      fontSize: 34,
      color: '#c7d2fe',
      x: 0.27,
    });
    const rightLabel = titleTextClip({
      trackId: rightTrackId,
      text: 'Right',
      startMs: 200,
      durationMs: Math.max(800, durationMs - 200),
      y: 0.2,
      fontSize: 34,
      color: '#c7d2fe',
      x: 0.73,
    });
    return createStudioScene({
      name,
      durationMs,
      tracks: [
        {
          id: leftTrackId,
          name: 'Left',
          type: 'video',
          locked: false,
          visible: true,
          clips: [],
        },
        {
          id: rightTrackId,
          name: 'Right',
          type: 'video',
          locked: false,
          visible: true,
          clips: [],
        },
        textTrack([leftLabel, rightLabel]),
      ],
    });
  }

  const intro = templateId === 'intro';
  const title = intro ? 'Product Walkthrough' : 'Try Qeda Today';
  const subtitle = intro ? 'Built with Qeda Studio' : 'qeda.app';
  const titleStartMs = intro ? 420 : 320;
  const subtitleStartMs = intro ? 820 : 700;
  const captions = textTrack([
    titleTextClip({
      trackId: 'captions',
      text: title,
      startMs: titleStartMs,
      durationMs: Math.max(600, durationMs - titleStartMs),
      y: 0.44,
      fontSize: 86,
      color: '#ffffff',
    }),
    titleTextClip({
      trackId: 'captions',
      text: subtitle,
      startMs: subtitleStartMs,
      durationMs: Math.max(600, durationMs - subtitleStartMs),
      y: 0.55,
      fontSize: 34,
      color: '#a5b4fc',
    }),
  ]);
  return createStudioScene({
    name,
    durationMs,
    tracks: [captions],
  });
}

// ── Story sequence ───────────────────────────────────────────────────────────

const CUT: { type: 'cut'; durationMs: number } = { type: 'cut', durationMs: 0 };

function sceneDuration(scene: StudioScene): number {
  return Math.max(
    1000,
    Math.round(scene.durationMs) || 1000,
    maxClipEndMs(scene.tracks),
  );
}

/**
 * Resolve the master-story timing. Explicit sequence items win; otherwise
 * scenes concatenate in array order, which is the v1 editing model.
 */
export function resolveStudioSequence(take: StudioTake): StudioResolvedSequence {
  const scenes = getStudioScenes(take);
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));

  if (take.sequence?.items && take.sequence.items.length > 0) {
    const items = take.sequence.items
      .filter((item) => byId.has(item.sceneId))
      .slice()
      .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
      .map((item) => ({
        ...item,
        durationMs: Math.max(
          1,
          Math.round(item.durationMs || sceneDuration(byId.get(item.sceneId)!)),
        ),
      }));
    const durationMs = Math.max(
      0,
      ...items.map((item) => item.startMs + item.durationMs),
    );
    return { items, durationMs };
  }

  let cursor = 0;
  const items: StudioSequenceItem[] = scenes.map((scene, index) => {
    const item: StudioSequenceItem = {
      id: `item-${index + 1}-${scene.id}`,
      sceneId: scene.id,
      startMs: cursor,
      durationMs: sceneDuration(scene),
      transitionIn: index > 0 ? { ...CUT } : undefined,
    };
    cursor += item.durationMs;
    return item;
  });
  return { items, durationMs: cursor };
}

export function studioSequenceDurationMs(take: StudioTake): number {
  return resolveStudioSequence(take).durationMs;
}

/**
 * Resolve one output time to the scene layer(s) visible at that instant.
 * Crossfades are resolved here for preview/export; the v1 editor authors cuts.
 */
export function sampleStudioSequence(
  take: StudioTake,
  timeMs: number,
): StudioSequenceFrame {
  const scenes = getStudioScenes(take);
  const sequence = resolveStudioSequence(take);
  const byId = new Map(scenes.map((scene) => [scene.id, scene]));
  const t = Math.max(0, timeMs);

  const active = sequence.items
    .filter((item) => item.startMs <= t && t < item.startMs + item.durationMs)
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));

  if (active.length === 0) return { layers: [] };

  const incoming = active[active.length - 1];
  const outgoing = active.length > 1 ? active[active.length - 2] : null;
  const incomingScene = byId.get(incoming.sceneId);
  if (!incomingScene) return { layers: [] };

  const incomingLayer: StudioSequenceLayer = {
    item: incoming,
    scene: incomingScene,
    sceneTimeMs: Math.min(
      incoming.durationMs,
      Math.max(0, t - incoming.startMs),
    ),
  };

  if (!outgoing) return { layers: [incomingLayer] };

  const outgoingScene = byId.get(outgoing.sceneId);
  if (!outgoingScene) return { layers: [incomingLayer] };

  const transition =
    incoming.transitionIn ?? outgoing.transitionOut ?? CUT;
  const overlapEnd = Math.min(
    outgoing.startMs + outgoing.durationMs,
    incoming.startMs + incoming.durationMs,
  );
  const overlapMs = Math.max(0, overlapEnd - incoming.startMs);
  const transitionMs = Math.min(transition.durationMs, overlapMs);

  if (transition.type === 'cut' || transitionMs <= 0 || t >= incoming.startMs + transitionMs) {
    return { layers: [incomingLayer] };
  }

  return {
    layers: [
      {
        item: outgoing,
        scene: outgoingScene,
        sceneTimeMs: Math.min(
          outgoing.durationMs,
          Math.max(0, t - outgoing.startMs),
        ),
      },
      incomingLayer,
    ],
    transition: {
      type: transition.type,
      progress: Math.min(1, Math.max(0, (t - incoming.startMs) / transitionMs)),
      ...(transition.color ? { color: transition.color } : {}),
    },
  };
}

/** Reorder scenes. Scene array order is the implicit story order. */
export function reorderStudioScenes(
  take: StudioTake,
  fromIndex: number,
  toIndex: number,
): StudioTake {
  const scenes = getStudioScenes(take).slice();
  if (
    fromIndex < 0 ||
    fromIndex >= scenes.length ||
    toIndex < 0 ||
    toIndex >= scenes.length ||
    fromIndex === toIndex
  ) {
    return take;
  }
  const [moved] = scenes.splice(fromIndex, 1);
  scenes.splice(toIndex, 0, moved);
  return { ...take, scenes };
}