# Plan: Inspector Filters UI (creative field renders + Figma-style popovers)

## Goal
Add a structured SVG filter system to NovaTrace (parallel to gradients) plus an inspector **Effects** section that lets users browse presets, apply a filter to the selected element, edit its primitives through Figma-style popovers, and round-trip through defs/exports.

## Context already in place
- `filter` is an animatable element attribute (`url(#id)`) wired through types, lint, svg-markup, renderer, dom-renderer, trace tool, docs.
- `src/lib/trace/filters/types.ts` defines `TraceFilter`, `FilterPrimitive`, `FilterPreset`.
- `src/lib/trace/filters/serialize.ts` defines `filterToSvg`, `filtersToDefs`, `parseFiltersFromDefs`.
- Gap: `TraceProject` has no `filters` field; defs serialization omits filters; no inspector UI; no presets; no `setFilters` op.

## Scope decisions
1. Structured `project.filters: Record<string, TraceFilter>` (mirrors `project.gradients`), serialized into defs via `filtersToDefs`.
2. Element `filter` attr = `url(#id)` (already wired).
3. Inspector Effects section with preset picker popover + per-filter config popover (Figma-style additional controls).
4. ~12 presets covering glow, shadow, blur, color, distort, edge, blend, light.
5. `setFilters` op for create/update/remove.

## Tasks (ordered)

### A. Data model & serialization

1. `src/lib/trace/types.ts`
   - Import `TraceFilter` type from `@/lib/trace/filters/types` (type-only).
   - Add `filters?: Record<string, TraceFilter>` to `TraceProject` (after `gradients`).
   - Change `TraceFilter.region` from `string` to `number` (expansion percent, default 10) in filters/types.ts.

2. `src/lib/trace/filters/serialize.ts`
   - Fix region serialization: `x="-{r}%" y="-{r}%" width="{100+2r}%" height="{100+2r}%"`.
   - Add `renderPrimitive()` with special handling:
     - `feMerge`: render `<feMerge><feMergeNode in="…"/>…</feMerge>` from `params.mergeNodes`.
     - `feComponentTransfer`: render `<feComponentTransfer>` with child `feFuncR/G/B/A` from params.
     - `feDiffuseLighting`/`feSpecularLighting`: inline light source child.
     - others: self-closing tag.
   - Make `parseFiltersFromDefs` best-effort round-trip (nested children).

3. `src/lib/trace/ops/types.ts`: add `| { type: 'setFilters'; filters: TraceProject['filters'] }`.

4. `src/lib/trace/ops/index.ts`
   - `snapshotOf`: include `filters: clone.filters`.
   - switch: `case 'setFilters': opSetFilters(project, op); return;`
   - `opSetFilters`: `project.filters = deepClone(op.filters)`.

5. `src/lib/trace/serialize/svg-markup.ts`, `TraceRenderer.tsx`, `export/animated-svg.ts`: defs string = `${gradientsToDefs(project.gradients)}${filtersToDefs(project.filters)}${project.defs ?? ''}`.

6. `src/lib/trace/lint.ts`: in paint-ref validation, collect def ids from `project.filters` (filterToSvg ids) so structured filter refs don't false-positive.

7. `src/lib/trace/templates/default-project.ts`: add a couple of default filters (e.g. `nova-glow`, `nova-shadow`) to demonstrate.

### B. Presets

8. `src/lib/trace/filters/presets.ts`: export `FILTER_PRESETS: FilterPreset[]` (~12) covering:
   - Drop shadow, Soft glow, Neon bloom, Inner glow
   - Gaussian blur, Motion blur (directional)
   - Duotone, Grayscale, Sepia, Hue shift
   - Glitch (RGB split), Film grain
   - Outline (dilate), Emboss, Rough edges (turbulence displace)

### C. Inspector UI

9. `src/components/trace/inspector/filters.tsx` (new file) with:
   - `FiltersSection({ element })` — collapsible PanelSection "Effects".
   - Reads `project`, `project.filters`, element's current `filter` attr (parse `url(#id)`).
   - Row per applied filter (element has at most one via filter attr, but section supports list for future stacking): toggle (eye), name chip, inline params (X/Y/Blur/Color swatch), ⋯ popover (advanced params + region + colorSpace), trash.
   - `FilterPickerPopover`: triggered by "+" in section action. Lists presets (grouped by kind) + project filters. Selecting creates/updates a filter in project.filters (if preset, clone with new id) and applies to element.
   - `FilterConfigPopover`: primitive param editor — per primitive card with kind label and key-value inputs (number/color/text/select), add/remove primitive, region slider, colorSpace select.
   - Creative field renders: colored dot per kind, compact inline scrub fields, color swatch.

10. `TraceInspector.tsx`: import and render `<FiltersSection element={element} />` after `StrokeSection`.

11. `src/main/tools/trace.ts`: add `'filter'` already done; optionally add filter creation tool? Out of scope for v1 (inspector only). Note in plan.

### D. Docs

12. `docs/systems/novatrace-system.md`: document `filters` project field, Effects section, preset list.

### E. Validation

13. Run typecheck (`bunx tsc --noEmit -p tsconfig.json`) — only pre-existing error allowed.
14. Run trace tests (`bun run jest --testPathPatterns=trace`).

## Risks / edge cases
- Circular import: filters/types.ts must not import types.ts. TraceProject imports TraceFilter via type-only import (allowed, isolatedModules-safe).
- Deep clone of filters in snapshot/restore: structuredClone handles nested.
- Imported SVG filters in defs: parseFiltersFromDefs best-effort; raw defs remain as fallback so nothing breaks.
- Element with `filter` referencing a missing id: lint flags DEF_REF_MISSING (already).
- Filter region default: 10% expansion prevents blur clipping.
- `color-interpolation-filters`: default linearRGB; expose sRGB toggle for color-accurate grading.
- Performance: filters are CPU-heavy; document in docs (already).

## Open questions
- None blocking; proceed with implementation in code mode.

## Out of scope
- Copilot tools for filter creation (inspector only for v1).
- Stacking multiple filters on one element (single filter attr; feMerge handles internal stacking).
- Animated filter params (SVG filter params aren't tracks; element-level filter switching is the supported animation).
