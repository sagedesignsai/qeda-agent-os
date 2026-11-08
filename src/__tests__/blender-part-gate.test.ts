/**
 * __tests__/blender-part-gate.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the PART safety gate (isAuthoredPartSafe in runner.ts).
 *
 * Validates that dangerous patterns are blocked while legitimate mesh-building
 * code passes. No Blender needed.
 */

import { isAuthoredPartSafe } from '../main/blender/runner';

describe('isAuthoredPartSafe', () => {
  it('allows simple primitive usage', () => {
    const part = `
cube = primitive("cube", size=1.0)
link(cube, mat("Red", (1, 0, 0)))
`;
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('allows bmesh usage', () => {
    const part = `
import bmesh, math
bm = bmesh.new()
bm.verts.new((0, 0, 0))
bm.verts.new((1, 0, 0))
bm.verts.new((0, 1, 0))
bm.faces.new(bm.verts)
`;
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('allows math and mathutils imports', () => {
    const part = `
import math
from mathutils import Vector, Matrix
v = Vector((1, 2, 3))
angle = math.radians(45)
`;
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('allows bpy.ops.mesh operations', () => {
    const part = `
bpy.ops.mesh.primitive_cube_add(size=1.0)
obj = bpy.context.active_object
obj.name = "Cube"
`;
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('allows for loops', () => {
    const part = `
for i in range(4):
    leg = primitive("cylinder", radius=0.03)
    link(leg)
`;
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('allows random module usage', () => {
    const part = `
import random
x = random.uniform(-0.5, 0.5)
`;
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('blocks os import', () => {
    const part = 'import os\nos.system("ls")';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('blocked import');
  });

  it('blocks subprocess import', () => {
    const part = 'import subprocess';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks socket import', () => {
    const part = 'import socket';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks sys import', () => {
    const part = 'import sys';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks requests import', () => {
    const part = 'import requests';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks tempfile import', () => {
    const part = 'import tempfile';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks importlib import', () => {
    const part = 'import importlib';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks from-import of blocked modules', () => {
    const part = 'from os import path';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks __import__ call', () => {
    const part = "mod = __import__('os')";
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('__import__');
  });

  it('blocks open() call', () => {
    const part = 'f = open("/etc/passwd")';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('open/exec/eval');
  });

  it('blocks exec() call', () => {
    const part = 'exec("import os")';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks eval() call', () => {
    const part = 'eval("1+1")';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks while loops', () => {
    const part = 'while True:\n    pass';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('while');
  });

  it('blocks bpy.ops.wm access', () => {
    const part = 'bpy.ops.wm.save_main()';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('harness-owned');
  });

  it('blocks bpy.ops.file access', () => {
    const part = 'bpy.ops.file.browse()';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks bpy.ops.export_scene', () => {
    const part = 'bpy.ops.export_scene.gltf(filepath="/tmp/out.glb")';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks bpy.app access', () => {
    const part = 'print(bpy.app.version)';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('bpy.app/path/utils');
  });

  it('blocks bpy.path access', () => {
    const part = 'bpy.path.abspath(".")';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks os. access without import', () => {
    const part = 'os.system("rm -rf /")';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('OS/shell');
  });

  it('blocks subprocess. access without import', () => {
    const part = 'subprocess.call(["ls"])';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
  });

  it('blocks filesystem mutation calls', () => {
    const part = 'mkdir("/tmp/evil")';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('filesystem');
  });

  it('allows Blender collection cleanup (method calls, not filesystem)', () => {
    // Copied from the harness/template scene setup: mutates a bpy
    // collection, never the filesystem. Must not trip the
    // filesystem-mutation gate (the original chair PART failure).
    const part = `
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
`;
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('allows mesh/material collection removal and list remove', () => {
    const part = `
mesh = bpy.data.meshes.new("Seat")
items.remove(mesh)
verts.remove(v)
`;
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('enforces 32 KB size cap', () => {
    const part = 'x = "' + 'a'.repeat(32_001) + '"';
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('32 KB');
  });

  it('allows code at exactly 32 KB', () => {
    const part = '# ' + 'x'.repeat(31_990);
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('allows complex chair PART example', () => {
    const part = `
import math

# Build a dining chair
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
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });

  it('allows bmesh with complex geometry', () => {
    const part = `
import bmesh, math
from mathutils import Vector

bm = bmesh.new()
verts = []
for i in range(8):
    angle = math.radians(i * 45)
    x = math.cos(angle) * 0.5
    y = math.sin(angle) * 0.5
    verts.append(bm.verts.new((x, y, 0)))

for i in range(8):
    bm.faces.new([verts[0], verts[i], verts[(i + 1) % 8]])

mesh = bpy.data.meshes.new("Octagon")
bm.to_mesh(mesh)
obj = bpy.data.objects.new("Octagon", mesh)
link(obj, mat("Base", (0.7, 0.7, 0.7)))
`;
    const result = isAuthoredPartSafe(part);
    expect(result.ok).toBe(true);
  });
});
