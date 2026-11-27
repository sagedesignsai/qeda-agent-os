/**
 * lib/trace/addons/surfaces/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Surfaces add-on: ten prebuilt, fully editable animated backgrounds.
 */

import type { TraceBlockDefinition } from '../../blocks/types';
import type { TraceAddonDefinition } from '../types';
import {
  auroraSurfaceBlock,
  grainSurfaceBlock,
  starfieldSurfaceBlock,
} from './atmosphere';
import {
  bauhausSurfaceBlock,
  blueprintSurfaceBlock,
  halftoneSurfaceBlock,
} from './geometry';
import {
  orbitSurfaceBlock,
  speedlinesSurfaceBlock,
  terrainSurfaceBlock,
  wavesSurfaceBlock,
} from './motion';

export {
  auroraSurfaceBlock,
  grainSurfaceBlock,
  starfieldSurfaceBlock,
  bauhausSurfaceBlock,
  blueprintSurfaceBlock,
  halftoneSurfaceBlock,
  orbitSurfaceBlock,
  speedlinesSurfaceBlock,
  terrainSurfaceBlock,
  wavesSurfaceBlock,
};

export const SURFACE_BLOCKS: readonly TraceBlockDefinition[] = [
  auroraSurfaceBlock,
  wavesSurfaceBlock,
  bauhausSurfaceBlock,
  blueprintSurfaceBlock,
  orbitSurfaceBlock,
  terrainSurfaceBlock,
  starfieldSurfaceBlock,
  halftoneSurfaceBlock,
  grainSurfaceBlock,
  speedlinesSurfaceBlock,
];

export const SURFACES_ADDON: TraceAddonDefinition = {
  id: 'surfaces',
  name: 'Surfaces',
  description:
    'Animated backgrounds and graphic surfaces built from editable Trace layers: gradients, filters, paths and ordinary tracks.',
  category: 'Backgrounds',
  keywords: [
    'surface',
    'background',
    'backdrop',
    'wallpaper',
    'texture',
    'ambient',
    'generator',
    'aurora',
    'waves',
    'grid',
    'stars',
    'grain',
    'bauhaus',
  ],
  blocks: SURFACE_BLOCKS,
  generator: {
    toolName: 'generateSurface',
    description:
      'Generate a bespoke Trace-compatible background surface from a brief. It emits SVG plus editable animation tracks, validates the parsed fragment, and proposes insertion without writing to the project.',
  },
  guidance: `## Surfaces add-on
Search the Backgrounds category before hand-building a backdrop. Prebuilt surfaces cover aurora mesh, wave stacks, Bauhaus fields, blueprint grids, orbital systems, terrain ridges, star fields, halftone matrices, film grain and speed lines. \`insertBlock\` lands them at the back of the stack as ordinary layers; recolour, retime and rearrange afterwards with the normal tools. When the user wants a custom surface, delegate to \`generateSurface\` with their brief rather than composing dozens of layers by hand. A generated surface arrives as validated layers and tracks — apply it through \`insertFragment\`, then lint and preview.`,
};