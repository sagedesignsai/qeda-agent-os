/**
 * main/blender/harness-template.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Deterministic harness for LLM-authored Blender asset generation.
 *
 * The model ONLY authors the PART (mesh-building bpy code). The harness owns:
 *   - scene setup (factory-empty, collection, seeded random)
 *   - the helpers API the PART is allowed to call (mat, link, ground helpers)
 *   - a fixed Workbench-safe light rig + preview camera
 *   - postlude: bbox grounding (min z → 0), machine-readable QEDA_REPORT,
 *     GLB export, preview render
 *
 * Invariants:
 *   - The PART is inserted verbatim by string concatenation (never inside a
 *     JS template literal, so backticks/${} in generated code are inert).
 *   - The brief NEVER enters Python (naming happens in TS, same rule as the
 *     legacy template).
 *   - Harness + gates are pinned to Blender 5.2 LTS (probeBlender enforces).
 */

export interface HarnessScriptInput {
  /** LLM-authored mesh-building bpy code (validated upstream by the gate). */
  part: string;
  seed: number;
  maxTriangles: number;
  outputPath: string;
  previewPath?: string;
}

const PRELUDE = `
import bpy, math, random, json, time
from mathutils import Vector

START = time.time()
random.seed($SEED)

# --- fixed scene setup (Blender 5.x collection API) ---
bpy.ops.wm.read_factory_settings(use_empty=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

scene = bpy.context.scene
collection = bpy.data.collections.get("Collection")
if not collection:
    collection = bpy.data.collections.new("Collection")
    scene.collection.children.link(collection)

# --- helpers available to the PART ---
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
    """Convenience: primitive_cube_add / sphere / cylinder / torus / plane."""
    op = getattr(bpy.ops.mesh, "primitive_%s_add" % kind)
    op(**kwargs)
    return bpy.context.active_object
`;

const RIG = `
# --- fixed verification rig (Workbench ignores lights; kept for PBR preview) ---
try:
    bpy.ops.object.light_add(type='SUN', location=(4, -4, 6))
    bpy.context.active_object.rotation_euler = (0.6, 0.25, 0.78)
    bpy.ops.object.light_add(type='AREA', location=(-4, 2, 4))
    bpy.context.active_object.rotation_euler = (1.0, 0.0, -0.6)
    bpy.ops.object.light_add(type='AREA', location=(2, 4, -2))
except Exception:
    pass
`;

const PART_MARKER = `
# ---- PART (LLM-authored; prelude/postlude are harness-owned) ----
`;

const POSTLUDE = `
# ---- harness postlude: grounding, report, export, preview ----
deps = bpy.context.evaluated_depsgraph_get()
mesh_objs = [o for o in scene.collection.objects if o.type == 'MESH']

# Ground: shift so the lowest vertex-plane sits at z = 0
mins = []
for o in mesh_objs:
    for corner in o.bound_box:
        mins.append((o.matrix_world @ Vector(corner)).z)
if mins:
    for o in mesh_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objs[0]
    bpy.ops.transform.translate(value=(0, 0, -min(mins)))

# Machine-readable report (single line, JSON after the marker)
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
    "tri_budget": $MAX_TRI,
    "part_count": len(mesh_objs),
    "parts": parts,
    "seconds": round(time.time() - START, 2),
}
print("QEDA_REPORT " + json.dumps(report))

bpy.ops.export_scene.gltf(
    filepath=r"$OUTPUT_PATH",
    export_format='GLB',
    export_apply=True,
    export_materials='EXPORT',
)
print("BLENDER_EXPORT_OK")

# Visual verification preview (Workbench, fast, headless-safe)
try:
    bpy.context.scene.render.engine = 'BLENDER_WORKBENCH'
    bpy.context.scene.render.resolution_x = 512
    bpy.context.scene.render.resolution_y = 512
    bpy.context.scene.render.film_transparent = True
    bpy.ops.object.camera_add(location=(4, -4, 3))
    cam = bpy.context.active_object
    scene.camera = cam
    cam.rotation_euler = (0.6, 0, 0.78)
    scene.render.filepath = r"$PREVIEW_PATH"
    bpy.ops.render.render(write_still=True)
    print("BLENDER_PREVIEW_OK")
except Exception as e:
    print("BLENDER_PREVIEW_SKIPPED", e)
`;

/**
 * Assemble the harness without JS template interpolation of the PART, so
 * generated code containing backticks/${ cannot break the build.
 */
export function buildHarnessScript(input: HarnessScriptInput): string {
  const preview = input.previewPath ?? null;
  const script = [
    PRELUDE.replace('$SEED', String(Math.max(0, Math.floor(input.seed ?? 1)))),
    RIG,
    PART_MARKER,
    input.part,
    '\n',
    POSTLUDE.replace('$MAX_TRI', String(Math.max(1, Math.floor(input.maxTriangles))))
      .replace('$OUTPUT_PATH', input.outputPath)
      .replace('$PREVIEW_PATH', preview ?? '/dev/null'),
  ].join('\n');
  return script;
}
