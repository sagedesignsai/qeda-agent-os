/**
 * __tests__/blender-harness-template.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the harness template assembler (harness-template.ts).
 *
 * Validates that the assembled Python script contains all required sections,
 * correctly interpolates parameters, and safely embeds the PART verbatim.
 * No Blender needed.
 */

import { buildHarnessScript } from '../main/blender/harness-template';

describe('buildHarnessScript', () => {
  const baseInput = {
    part: 'cube = primitive("cube", size=1.0)\nlink(cube, mat("Red", (1,0,0)))',
    seed: 42,
    maxTriangles: 50_000,
    outputPath: '/tmp/test/output.glb',
    previewPath: '/tmp/test/preview.png',
  };

  it('includes the prelude with scene setup', () => {
    const script = buildHarnessScript(baseInput);
    expect(script).toContain('import bpy, math, random, json, time');
    expect(script).toContain('from mathutils import Vector');
    expect(script).toContain('read_factory_settings(use_empty=True)');
  });

  it('seeds random with the provided seed', () => {
    const script = buildHarnessScript({ ...baseInput, seed: 12345 });
    expect(script).toContain('random.seed(12345)');
  });

  it('clamps negative seed to 0', () => {
    const script = buildHarnessScript({ ...baseInput, seed: -1 });
    expect(script).toContain('random.seed(0)');
  });

  it('includes the helpers API', () => {
    const script = buildHarnessScript(baseInput);
    expect(script).toContain('def mat(name, color');
    expect(script).toContain('def link(obj, material=None)');
    expect(script).toContain('def primitive(kind, **kwargs)');
  });

  it('includes the light rig', () => {
    const script = buildHarnessScript(baseInput);
    expect(script).toContain("type='SUN'");
    expect(script).toContain("type='AREA'");
  });

  it('includes the PART marker comment', () => {
    const script = buildHarnessScript(baseInput);
    expect(script).toContain('# ---- PART (LLM-authored');
  });

  it('embeds the PART verbatim', () => {
    const script = buildHarnessScript(baseInput);
    expect(script).toContain('cube = primitive("cube", size=1.0)');
    expect(script).toContain('link(cube, mat("Red", (1,0,0)))');
  });

  it('handles PART with backticks and dollar signs without breaking', () => {
    const trickyPart = `
# This PART contains ${'dangerous'} JS-like syntax
x = "backtick: \`"
y = "$$money"
cube = primitive("cube")
`;
    const script = buildHarnessScript({ ...baseInput, part: trickyPart });
    // The PART should appear verbatim — no JS template interpolation
    expect(script).toContain('$$money');
    expect(script).toContain('backtick: `');
    expect(script).toContain('cube = primitive("cube")');
  });

  it('includes the postlude with grounding', () => {
    const script = buildHarnessScript(baseInput);
    expect(script).toContain('evaluated_depsgraph_get()');
    expect(script).toContain('QEDA_REPORT');
  });

  it('includes the GLB export command with correct path', () => {
    const script = buildHarnessScript(baseInput);
    expect(script).toContain('export_scene.gltf');
    expect(script).toContain('/tmp/test/output.glb');
    expect(script).toContain("export_format='GLB'");
    expect(script).toContain('export_apply=True');
  });

  it('includes the preview render with correct path', () => {
    const script = buildHarnessScript(baseInput);
    expect(script).toContain('BLENDER_WORKBENCH');
    expect(script).toContain('/tmp/test/preview.png');
    expect(script).toContain('resolution_x = 512');
    expect(script).toContain('resolution_y = 512');
  });

  it('uses /dev/null for preview when previewPath is omitted', () => {
    const script = buildHarnessScript({ ...baseInput, previewPath: undefined });
    expect(script).toContain('/dev/null');
  });

  it('includes the triangle budget in the report', () => {
    const script = buildHarnessScript({ ...baseInput, maxTriangles: 25_000 });
    expect(script).toContain('"tri_budget": 25000');
  });

  it('includes BLENDER_EXPORT_OK marker', () => {
    const script = buildHarnessScript(baseInput);
    expect(script).toContain('BLENDER_EXPORT_OK');
  });

  it('does NOT include the brief in Python code', () => {
    const script = buildHarnessScript({
      ...baseInput,
      part: 'cube = primitive("cube")',
    });
    // The brief is never passed to buildHarnessScript, so it can't leak.
    // This is a structural guarantee test.
    expect(script).not.toContain('brief');
  });

  it('handles empty PART without crashing', () => {
    const script = buildHarnessScript({ ...baseInput, part: '' });
    expect(script).toContain('BLENDER_EXPORT_OK');
    expect(script).toContain('QEDA_REPORT');
  });

  it('handles multi-line PART with complex Python', () => {
    const complexPart = `
import math

# Build a chair
seat = primitive("cube", size=0.5)
seat.scale = (1.2, 0.1, 0.8)
link(seat, mat("Wood", (0.6, 0.4, 0.2)))

backrest = primitive("cube", size=0.3)
backrest.location = (0, -0.4, 0.4)
backrest.scale = (1.2, 0.1, 1.0)
link(backrest, mat("Wood", (0.6, 0.4, 0.2)))

for i in range(4):
    leg = primitive("cylinder", radius=0.03, depth=0.5)
    angle = math.radians(i * 90)
    leg.location = (math.cos(angle) * 0.5, math.sin(angle) * 0.5, -0.25)
    link(leg, mat("Wood", (0.5, 0.3, 0.15)))
`;
    const script = buildHarnessScript({ ...baseInput, part: complexPart });
    expect(script).toContain('seat = primitive("cube", size=0.5)');
    expect(script).toContain('backrest = primitive("cube", size=0.3)');
    expect(script).toContain('for i in range(4):');
    expect(script).toContain('BLENDER_EXPORT_OK');
  });
});
