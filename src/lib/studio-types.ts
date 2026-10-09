/**
 * lib/studio-types.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Backward-compatible entrypoint for the Studio domain package.
 *
 * The implementation lives under `lib/studio/` (types, styling, effects,
 * captions, timeline). This shim keeps the many existing imports — including the
 * main-process `channels.ts` contract — resolving to one path.
 *
 * NOTE: `lib/studio/index.ts` belongs to a separate image-composer package, so
 * this shim re-exports the video submodules explicitly rather than `./studio`.
 * Render-only modules are intentionally excluded; import them from
 * `@/lib/studio/render/*`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export * from './studio/types';
export * from './studio/styling';
export * from './studio/media';
export * from './studio/effects/catalog';
export * from './studio/effects/zoom-presets';
export * from './studio/captions/presets';
export * from './studio/timeline/convert';
