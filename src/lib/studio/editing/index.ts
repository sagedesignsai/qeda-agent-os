/**
 * lib/studio/editing/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Public API for the pure editing layer.
 *
 * Every mutator takes a `StudioTake` and returns a new one, which makes the
 * agent tools thin: resolve → materialize → apply → persist.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export {
  isProjectTake,
  materializeProjectTracks,
} from './materialize';

export {
  createTrack,
  deleteTrack,
  findTrackByType,
  getTrack,
  isStudioTrackType,
  listTracks,
  reorderTracks,
  updateTrack,
} from './tracks';

export {
  addClip,
  findClip,
  listClips,
  moveClip,
  projectDurationMs,
  removeClip,
  setClipProperties,
  updateClip,
  type AddClipInput,
  type ClipPropertiesPatch,
  type FoundClip,
  type MoveClipInput,
} from './clips';

export {
  addClipEffect,
  addEffectKeyframe,
  applyColorLut,
  listColorLutPresets,
  listEffectCatalog,
  removeClipEffect,
  removeEffectKeyframe,
  reorderClipEffects,
  setClipMask,
  updateClipEffect,
  MAX_EFFECTS_PER_CLIP,
  type AddClipEffectInput,
  type AddEffectKeyframeInput,
  type CatalogEntry,
  type ClipMaskPatch,
  type UpdateClipEffectInput,
} from './effects';

export {
  addClipFromAsset,
  autoCreateTracks,
  createMediaAsset,
  detectAudioTrack,
  importRecording,
  type AddClipFromAssetInput,
  type CreateMediaAssetInput,
  type ImportRecordingInput,
} from './media';

export {
  addCaption,
  addOverlay,
  describeProject,
  findElementClip,
  listClipEffects,
  removeCaption,
  removeOverlay,
  setProjectStyling,
  type AddCaptionInput,
  type AddOverlayInput,
  type ProjectState,
  type ProjectStylingPatch,
} from './composition';
