/**
 * ai/motion-capability.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Motion capability discovery service.
 * Turns a free-form query into grounded guidance derived from the live
 * registry (describeMotionEngine) — never hand-written prose that drifts.
 * Mirrors Trace getTraceCapability + capability-discovery-architecture.md.
 */

import { listMotionNodeTypes } from '../../lib/motion/node-registry';
import { listMotionRecipes } from '../../lib/motion/recipes';

export interface MotionCapabilityAnswer {
  query: string;
  patterns: Array<{ id: string; label: string; description: string; useWhen: string }>;
  nodeTypes: Array<{ id: string; label: string; category: string; when: string }>;
  recipes: Array<{ id: string; label: string; description: string }>;
  practices: string[];
  available: true;
}

const DESIGN_PRACTICES = [
  'Dark backgrounds with depth: slate tones over flat black.',
  'Generous whitespace — elements breathe, never edge-to-edge.',
  'One focal point per scene (hero product / title), centered with calculated positions.',
  'Key + rim lighting for 3D hero shots; ambient for flat UI scenes.',
  'Name nodes meaningfully (Hero, Bar 1, Rim Light) so the user can find them.',
  'Group related changes in one scene op batch for atomicity.',
];

const PATTERNS: Array<{ id: string; label: string; description: string; useWhen: string; keywords: string[] }> = [
  {
    id: 'product-hero',
    label: 'Product Hero',
    description: 'Pedestal product shot with key/rim light and camera.',
    useWhen: 'Showcasing a product, packaging, or hero object.',
    keywords: ['product', 'hero', 'pedestal', 'packaging', 'showcase', 'ecommerce'],
  },
  {
    id: 'stinger-3d',
    label: '3D Logo Stinger',
    description: 'Dark backdrop + glow + centered title + accent ring, built for reveal animation.',
    useWhen: 'Logo reveals, intros, brand stingers, sponsor cards.',
    keywords: ['logo', 'stinger', 'intro', 'sponsor', 'brand', 'reveal', 'title'],
  },
  {
    id: 'data-viz',
    label: 'Data Viz',
    description: 'Grid floor + title + bar trio of geometry boxes.',
    useWhen: 'Metrics, charts, dashboards in 3D.',
    keywords: ['data', 'chart', 'metrics', 'bar', 'dashboard', 'graph'],
  },
  {
    id: 'procedural',
    label: 'Procedural Modeling',
    description: 'Deterministic arrays/radial/grid/scatter/curve, ≤5000 instances, seeded.',
    useWhen: 'Repetition, patterns, crowds, scatter fields.',
    keywords: ['scatter', 'array', 'grid', 'radial', 'curve', 'pattern', 'crowd', 'repeat'],
  },
  {
    id: 'blender',
    label: 'Blender Asset',
    description: 'Bespoke GLB via headless Blender, placed as model.gltf.',
    useWhen: 'Hero geometry/materials primitives cannot express; organic or complex shapes.',
    keywords: ['blender', 'bespoke', 'custom', 'sculpt', 'organic', 'complex', 'realistic', 'pbr'],
  },
  {
    id: 'lighting',
    label: 'Lighting',
    description: 'Ambient fill + directional key with shadows; point for accents.',
    useWhen: 'Any 3D scene needs a key light to read as 3D.',
    keywords: ['light', 'shadow', 'glow', 'studio', 'dark', 'rim', 'key'],
  },
];

function scorePattern(keywords: string[], query: string): number {
  const q = query.toLowerCase();
  return keywords.reduce((n, k) => (q.includes(k) ? n + 1 : n), 0);
}

export function discoverMotionCapability(query: string): MotionCapabilityAnswer {
  const q = query.trim() || 'motion scene';
  const scored = PATTERNS.map((p) => ({ p, s: scorePattern(p.keywords, q) }))
    .sort((a, b) => b.s - a.s);
  const top = scored.filter((x) => x.s > 0).map((x) => x.p);
  const patterns = (top.length > 0 ? top : PATTERNS).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    useWhen: p.useWhen,
  }));

  // Ground node types: prefer matches by keyword, else full catalog summary.
  const all = listMotionNodeTypes();
  const matched = all.filter((n) => {
    const hay = `${n.id} ${n.label} ${n.category}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).some((w) => w.length > 3 && hay.includes(w));
  });
  const picks = matched.length > 0 ? matched.slice(0, 12) : all;

  return {
    query: q,
    patterns,
    nodeTypes: picks.map((n) => ({
      id: n.id,
      label: n.label,
      category: n.category,
      when: n.description ?? '',
    })),
    recipes: listMotionRecipes().map((r) => ({ id: r.id, label: r.label, description: r.description })),
    practices: DESIGN_PRACTICES,
    available: true,
  };
}
