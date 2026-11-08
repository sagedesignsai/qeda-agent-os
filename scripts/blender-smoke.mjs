/**
 * scripts/blender-smoke.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Integration smoke test for the authored Blender pipeline.
 *
 * Runs a hand-written PART through the harness template, executes it in
 * headless Blender, and validates GLB + report + preview are produced.
 *
 * Usage:
 *   node scripts/blender-smoke.mjs
 *
 * Requires Blender 5.x on PATH (or QEDA_BLENDER_PATH env var).
 * Skips gracefully when Blender is not found.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Resolve Blender ─────────────────────────────────────────────────────────

function resolveBlender() {
  if (process.env.QEDA_BLENDER_PATH) return process.env.QEDA_BLENDER_PATH;
  const candidates = [
    'blender',
    '/usr/bin/blender',
    '/usr/local/bin/blender',
    '/Applications/Blender.app/Contents/MacOS/Blender',
  ];
  for (const c of candidates) {
    try {
      const exists = fs.existsSync(c) || c === 'blender';
      if (exists) {
        const r = execFile(c, ['--version'], { encoding: 'utf8', timeout: 10_000 });
        // We can't await in sync context, just return it
        return c;
      }
    } catch {}
  }
  return null;
}

// ─── Hand-written PART for smoke test ─────────────────────────────────────────

const SMOKE_PART = `
import math

# Build a simple stool: seat + 3 legs
seat = primitive("cylinder", radius=0.4, depth=0.05)
seat.location = (0, 0, 0.5)
link(seat, mat("Wood", (0.65, 0.45, 0.25)))

for i in range(3):
    angle = math.radians(i * 120)
    x = math.cos(angle) * 0.3
    y = math.sin(angle) * 0.3
    leg = primitive("cylinder", radius=0.03, depth=0.5)
    leg.location = (x, y, 0.25)
    link(leg, mat("Wood", (0.55, 0.35, 0.2)))
`;

// ─── Harness template (mirrors harness-template.ts) ───────────────────────────

function buildHarnessScript(part, seed, maxTriangles, outputPath, previewPath) {
  const preview = previewPath || '/dev/null';
  const script = [
    `
import bpy, math, random, json, time
from mathutils import Vector

START = time.time()
random.seed(${seed})

bpy.ops.wm.read_factory_settings(use_empty=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

scene = bpy.context.scene
collection = bpy.data.collections.get("Collection")
if not collection:
    collection = bpy.data.collections.new("Collection")
    scene.collection.children.link(collection)

def mat(name, color=(0.8, 0.8, 0.8), roughness=0.5, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m

def link(obj, material=None):
    scene.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    return obj

def primitive(kind, **kwargs):
    op = getattr(bpy.ops.mesh, "primitive_%s_add" % kind)
    op(**kwargs)
    return bpy.context.active_object
`,
    `
try:
    bpy.ops.object.light_add(type='SUN', location=(4, -4, 6))
    bpy.context.active_object.rotation_euler = (0.6, 0.25, 0.78)
    bpy.ops.object.light_add(type='AREA', location=(-4, 2, 4))
    bpy.context.active_object.rotation_euler = (1.0, 0.0, -0.6)
    bpy.ops.object.light_add(type='AREA', location=(2, 4, -2))
except Exception:
    pass
`,
    '# ---- PART (LLM-authored) ----\n',
    part,
    '\n',
    `
# ---- harness postlude ----
deps = bpy.context.evaluated_depsgraph_get()
mesh_objs = [o for o in scene.collection.objects if o.type == 'MESH']

mins = []
for o in mesh_objs:
    for corner in o.bound_box:
        mins.append((o.matrix_world @ Vector(corner)).z)
if mins:
    for o in mesh_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objs[0]
    bpy.ops.transform.translate(value=(0, 0, -min(mins)))

tri_count = 0
parts = []
for o in mesh_objs:
    eo = o.evaluated_get(deps)
    m = eo.to_mesh()
    n_tri = sum(len(p.vertices) - 2 for p in m.polygons)
    cor = [o.matrix_world @ Vector(c) for c in o.bound_box]
    bb_min = [round(min(v[i] for v in cor), 4) for i in range(3)]
    bb_max = [round(max(v[i] for v in cor), 4) for i in range(3)]
    parts.append({"name": o.name, "tris": n_tri, "min": bb_min, "max": bb_max})
    tri_count += n_tri
    eo.to_mesh_clear()

report = {
    "tri_count": tri_count,
    "tri_budget": ${maxTriangles},
    "part_count": len(mesh_objs),
    "parts": parts,
    "seconds": round(time.time() - START, 2),
}
print("QEDA_REPORT " + json.dumps(report))

bpy.ops.export_scene.gltf(
    filepath=r"${outputPath}",
    export_format='GLB',
    export_apply=True,
    export_materials='EXPORT',
)
print("BLENDER_EXPORT_OK")

try:
    bpy.context.scene.render.engine = 'BLENDER_WORKBENCH'
    bpy.context.scene.render.resolution_x = 512
    bpy.context.scene.render.resolution_y = 512
    bpy.context.scene.render.film_transparent = True
    bpy.ops.object.camera_add(location=(4, -4, 3))
    cam = bpy.context.active_object
    scene.camera = cam
    cam.rotation_euler = (0.6, 0, 0.78)
    scene.render.filepath = r"${preview}"
    bpy.ops.render.render(write_still=True)
    print("BLENDER_PREVIEW_OK")
except Exception as e:
    print("BLENDER_PREVIEW_SKIPPED", e)
`,
  ].join('\n');
  return script;
}

// ─── GLB meta parser (minimal, mirrors glb-meta.ts) ──────────────────────────

function parseGlbMeta(buffer) {
  try {
    if (buffer.byteLength < 20) return null;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) return null;
    const chunkLength = view.getUint32(12, true);
    const chunkType = view.getUint32(16, true);
    if (chunkType !== 0x4e4f534a) return null;
    const jsonBytes = buffer.subarray(20, 20 + chunkLength);
    const json = JSON.parse(new TextDecoder('utf-8').decode(jsonBytes));
    const meshes = json.meshes || [];
    const nodes = json.nodes || [];
    let triangles = 0;
    for (const mesh of meshes) {
      for (const prim of mesh.primitives || []) {
        const mode = prim.mode ?? 4;
        if (mode === 4 && prim.indices != null) {
          // In real GLB, indices is an accessor index (number)
          const acc = json.accessors?.[prim.indices];
          if (acc?.count != null) {
            triangles += Math.floor(acc.count / 3);
          }
        }
      }
    }
    return { triangles, meshes: meshes.length, nodes: nodes.length };
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Blender authored pipeline smoke test');
  console.log('─────────────────────────────────────');

  const blender = resolveBlender();
  if (!blender) {
    console.log('SKIP: Blender not found. Set QEDA_BLENDER_PATH or install Blender 5.x.');
    process.exit(0);
  }

  // Probe version
  let version = 'unknown';
  try {
    const { stdout } = await execFileAsync(blender, ['--version'], {
      timeout: 10_000,
      encoding: 'utf8',
    });
    version = stdout.trim().split('\n')[0];
  } catch {
    // continue anyway
  }
  console.log(`Blender: ${blender} (${version})`);

  // Create temp dir
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-blender-smoke-'));
  const glbPath = path.join(tmpDir, 'output.glb');
  const previewPath = path.join(tmpDir, 'preview.png');
  const scriptPath = path.join(tmpDir, 'harness.py');

  // Build and write harness
  const script = buildHarnessScript(SMOKE_PART, 42, 50_000, glbPath, previewPath);
  fs.writeFileSync(scriptPath, script, 'utf8');
  console.log(`Harness written: ${scriptPath}`);

  // Run Blender
  let stdout, stderr;
  try {
    const result = await execFileAsync(
      blender,
      ['--background', '--python', scriptPath],
      {
        timeout: 60_000,
        maxBuffer: 4 * 1024 * 1024,
        encoding: 'utf8',
        env: { ...process.env, BLENDER_HEADLESS: '1' },
      },
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    console.error('FAIL: Blender subprocess failed:', error.message);
    console.error('stdout:', error.stdout);
    console.error('stderr:', error.stderr);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }

  const combined = `${stdout}\n${stderr}`;

  // Assert BLENDER_EXPORT_OK
  if (!combined.includes('BLENDER_EXPORT_OK')) {
    console.error('FAIL: BLENDER_EXPORT_OK not found in output');
    console.error('Output tail:', combined.slice(-2000));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }
  console.log('✓ BLENDER_EXPORT_OK found');

  // Parse QEDA_REPORT
  const reportMatch = /QEDA_REPORT (\{.*\})/.exec(combined);
  if (!reportMatch) {
    console.error('FAIL: QEDA_REPORT not found in output');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(1);
  }
  const report = JSON.parse(reportMatch[1]);
  console.log(`✓ QEDA_REPORT parsed: ${report.part_count} parts, ${report.tri_count} tris in ${report.seconds}s`);

  // Validate report
  if (report.part_count < 1) {
    console.error('FAIL: part_count < 1');
    process.exit(1);
  }
  if (report.tri_count > 50_000) {
    console.error('FAIL: tri_count exceeds budget');
    process.exit(1);
  }
  console.log(`✓ Report validation passed (${report.part_count} parts, ${report.tri_count} tris ≤ 50000)`);

  // Validate GLB file
  const glbStat = fs.statSync(glbPath);
  if (glbStat.size === 0) {
    console.error('FAIL: output.glb is empty');
    process.exit(1);
  }
  console.log(`✓ output.glb: ${(glbStat.size / 1024).toFixed(1)} KB`);

  // Validate GLB magic
  const glbBuf = fs.readFileSync(glbPath);
  const magic = glbBuf.subarray(0, 4).toString('ascii');
  if (magic !== 'glTF') {
    console.error('FAIL: GLB magic is not "glTF"');
    process.exit(1);
  }
  console.log('✓ GLB magic valid');

  // Parse GLB meta
  const meta = parseGlbMeta(glbBuf);
  if (!meta) {
    console.error('FAIL: Could not parse GLB JSON chunk');
    process.exit(1);
  }
  console.log(`✓ GLB meta: ${meta.meshes} meshes, ${meta.nodes} nodes, ${meta.triangles} tris`);

  // Validate preview
  let previewOk = false;
  try {
    const previewStat = fs.statSync(previewPath);
    if (previewStat.size > 0) {
      previewOk = true;
      console.log(`✓ preview.png: ${(previewStat.size / 1024).toFixed(1)} KB`);
    }
  } catch {}
  if (!previewOk) {
    console.log('⚠ preview.png missing or empty (non-fatal)');
  }

  // Check for QEDA_PART_ERROR (should not be present)
  if (combined.includes('QEDA_PART_ERROR')) {
    console.error('FAIL: QEDA_PART_ERROR found in output');
    process.exit(1);
  }
  console.log('✓ No PART errors');

  // Cleanup
  if (!process.env.KEEP_TEMP) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } else {
    console.log(`Temp dir kept: ${tmpDir}`);
  }

  console.log('\n✅ All smoke tests passed');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
