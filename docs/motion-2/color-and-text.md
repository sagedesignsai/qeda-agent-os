# Color and text

**Phase:** 1 (text), 2 (color management polish)
**Dependencies:** `scenes-and-nodes.md`, `assets.md`
**Master spec:** §7.7, §8.4 (text), §11.3
**Goal:** crisp, brand-correct text and a color pipeline that does not shift
between preview and export.

## Text (troika-three-text)

Replace the canvas-texture title placeholder with `troika-three-text` for SDF
text. Props map to troika: `font` (asset URL), `fontSize`, `color`, `anchorX`,
`anchorY`, `maxWidth`, `lineHeight`, `letterSpacing`, `textAlign`. `maxLines`
truncates with an ellipsis in the layout pass, not via shader tricks.

- Font assets are loaded via `FontLoader`/troika. If a brand font asset is
  missing, fall back to the system stack and add a warning to the frame. Never
  silently substitute a different brand font without telling the user.
- `text.title` and `text.body` share the implementation; `text.badge` (Phase 2)
  adds `backgroundColor`, `paddingX`, `paddingY`.

## Color management

- Screen textures are sRGB and must not be tone-mapped twice (`toneMapped:
  false`).
- 3D materials are tone-mapped with ACES Filmic.
- The canvas uses `SRGBColorSpace` output (fix P0-1).
- The encoder receives sRGB frames. No second gamma transform in the muxer.
- Camera aspect ratio derived from output settings, not window size.
- Shadow map size is a render setting, not a document property.

## Transparency

- WebM/VP9 supports alpha in some configurations; MP4/H.264 does not.
- If the scene background is `transparent` and the preset is MP4, composite
  onto the brand background and add a `background-transparent-mp4` warning. Do
  not silently produce black.

## Font assets

- Formats: WOFF2, WOFF, TTF, OTF. `metadata.format` records which.
- Family/weight extraction is best-effort via `fontkit` (optional). If it
  fails, the user names the font.
- Missing font → system fallback + warning badge; export warns that typography
  may differ.

## Acceptance criteria

- Text renders crisp at 1080p and 4K.
- A missing font falls back and warns; export is not blocked but warns.
- Preview and export colors match within the documented tolerance.
- Transparent scenes warn on MP4.

## Files to touch

- `src/components/motion/scene/*Text*.tsx` — troika bindings.
- `src/components/motion/scene/MotionNodeRenderers.tsx` — register text renderers.
- `src/main/motion/asset-probe.ts` — font header parsing.

## Tests

- R3F test-renderer: each text type renders without throwing.
- Missing-font fallback test.
- Golden-frame test for a text scene.
