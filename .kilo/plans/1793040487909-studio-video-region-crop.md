# Studio Video Region Crop (Plugin Dialog + Timeline Context Menu)

## Goal
Let the user select a sub-region of a recorded take's source video (OBS-like crop) via a "video canvas editor" dialog, triggered from a right-click context menu on the primary video track, and render/export only that region on the main canvas.

## Data model
- Add `StudioVideoCrop { x, y, width, height }` (normalized 0..1) to `src/lib/studio/types.ts`.
- Add optional `videoCrop?: StudioVideoCrop` to `StudioTake`.
- Export `StudioVideoCrop` from `src/lib/studio-types.ts` (already re-exports types) and import in `src/main/ipc/channels.ts`.

## Persistence
- `src/main/db/schema.ts`: add `video_crop_json TEXT` to `CREATE_STUDIO_TAKES`; add `addColumn('studio_takes', 'video_crop_json', 'TEXT')` in `applyMigrations`.
- `src/main/db/studio-store.ts`: add `video_crop_json` to `StudioTakeRow`; parse in `rowToTake`; add `videoCrop: 'video_crop_json'` to update column map + jsonFields; add insert column/value + upsert assignment.
- Save/get already generic via `saveStudioTake`.

## Rendering
- `src/lib/studio/render/compose.ts`: add `videoCrop?: StudioVideoCrop` to `StudioComposeInput`. When present, use crop pixel rect as drawImage source and use crop aspect for `videoAspect`; bypass `cameraSourceRect` (camera zoom disabled for cropped takes). When absent, keep current camera behavior.
- `src/components/studio/StudioCanvas.tsx`: add `videoCrop` prop; pass to compose input; (optional) pass to `computeCameraTarget` only when no crop.
- `src/lib/studio/render/export-renderer.ts`: populate `videoCrop: take.videoCrop` in compose input.

## Plugin dialog
- New `src/components/studio/plugins/StudioVideoCropDialog.tsx`: dialog with a video preview + draggable/resizable crop rectangle overlay; Apply saves normalized crop via callback; Reset clears.
- Add `plugin-video-crop` entry to `StudioPluginRegistry.ts`.

## Timeline context menu
- `src/components/studio/timeline/TimelineCanvasViewport.tsx`: wrap canvas in shadcn `ContextMenu`; on right-click hit-test, record target clip; show "Crop video region…" item only when target track type === 'video'; on select call new prop `onOpenVideoCrop`.
- Thread `onOpenVideoCrop` through `StudioCanvasTimeline`.

## Studio page wiring
- `src/renderer/pages/Studio.tsx`: add `videoCropDialogOpen` state; pass `videoCrop={activeTake?.videoCrop}` to `StudioCanvas`; pass `onOpenVideoCrop={() => setVideoCropDialogOpen(true)}` to timeline; render dialog; `handleApplyVideoCrop` calls `studio:save-take` with `videoCrop` and `loadTake`.

## Validation
- `npm run build` then `npx jest src/__tests__/studio-takes src/__tests__/studio-timeline`.
- Manual: right-click video track → crop dialog → apply → preview/export show only cropped region.
- Migration idempotency checked by existing studio-takes tests.

## Risks
- Camera zooms vs crop coordinate mismatch: v1 disables camera zoom when crop set; zoom keyframes retained but ignored. Follow-up could rebase targets.
- Crop aspect changes window frame; device frames may not align; acceptable for v1.
- Existing takes default to no crop (null).
```

Then plan_exit.<|end|><|start|><|start|>assistant to=write<|channel|>analysis <|constrain|>xml<|message|><rfl:parameter name="content">
# Studio Video Region Crop (Plugin Dialog + Timeline Context Menu)

## Goal
Let the user select a sub-region of a recorded take's source video (OBS-like crop) via a "video canvas editor" dialog, triggered from a right-click context menu on the primary video track, and render/export only that region on the main canvas.

## Data model
- Add `StudioVideoCrop { x, y, width, height }` (normalized 0..1) to `src/lib/studio/types.ts`.
- Add optional `videoCrop?: StudioVideoCrop` to `StudioTake`.
- Export `StudioVideoCrop` from `src/lib/studio-types.ts` and import in `src/main/ipc/channels.ts` (type-only).

## Persistence
- `src/main/db/schema.ts`: add `video_crop_json TEXT` to `CREATE_STUDIO_TAKES`; add `addColumn('studio_takes', 'video_crop_json', 'TEXT')` in `applyMigrations`.
- `src/main/db/studio-store.ts`:
  - add `video_crop_json` to `StudioTakeRow`;
  - parse in `rowToTake` as `videoCrop`;
  - add `videoCrop: 'video_crop_json'` to update column map and to `jsonFields`;
  - add insert column + value + upsert assignment.

## Rendering
- `src/lib/studio/render/compose.ts`: add `videoCrop?: StudioVideoCrop` to `StudioComposeInput`. When present, use the crop pixel rect as the `drawImage` source, use crop aspect for `videoAspect`, and bypass `cameraSourceRect` (camera zoom disabled for cropped takes). When absent, keep current camera behavior.
- `src/components/studio/StudioCanvas.tsx`: add `videoCrop` prop; pass to compose input.
- `src/lib/studio/render/export-renderer.ts`: populate `videoCrop: take.videoCrop` in compose input.

## Plugin dialog
- New `src/components/studio/plugins/StudioVideoCropDialog.tsx`: dialog with a video preview + draggable/resizable crop rectangle overlay; Apply saves normalized crop via callback; Reset clears.
- Add `plugin-video-crop` entry to `StudioPluginRegistry.ts`.

## Timeline context menu
- `src/components/studio/timeline/TimelineCanvasViewport.tsx`: wrap canvas in shadcn `ContextMenu`; on right-click hit-test, record target clip; show "Crop video region…" item only when target track type === 'video'; on select call new prop `onOpenVideoCrop`.
- Thread `onOpenVideoCrop` through `StudioCanvasTimeline`.

## Studio page wiring
- `src/renderer/pages/Studio.tsx`: add `videoCropDialogOpen` state; pass `videoCrop={activeTake?.videoCrop}` to `StudioCanvas`; pass `onOpenVideoCrop={() => setVideoCropDialogOpen(true)}` to timeline; render dialog; `handleApplyVideoCrop` calls `studio:save-take` with `videoCrop` then `loadTake`.

## Validation
- `npm run build` then `npx jest src/__tests__/studio-takes src/__tests__/studio-timeline`.
- Manual: right-click video track → crop dialog → apply → preview/export show only cropped region.
- Migration idempotency covered by existing studio-takes tests.

## Risks / notes
- Camera zooms vs crop coordinate mismatch: v1 disables camera zoom when crop set; zoom keyframes retained but ignored. Follow-up could rebase targets into crop space.
- Crop aspect changes window frame; device frames may not align; acceptable for v1.
- Existing takes default to no crop.
- `isolatedModules`: use `import type` for `StudioVideoCrop` where type-only.
