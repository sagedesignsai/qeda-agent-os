/**
 * main/blender/templates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Blender 5.2 LTS python templates for deterministic asset generation.
 * The LLM never writes raw `bpy`; it supplies `brief/style/seed` and we
 * interpolate into a bounded template. Raw scripts are a separate gated tool.
 */

export type BlenderStyle = 'lowpoly' | 'pbr' | 'stylized';

export interface BlenderTemplateInput {
  brief: string;
  style?: BlenderStyle;
  seed?: number;
  maxTriangles?: number;
  outputPath: string;
}

const BASE = (input: BlenderTemplateInput) => `
import bpy, math, random
random.seed(${input.seed ?? 1})

# Clear default scene (Blender 5.x collections API)
bpy.ops.wm.read_factory_settings(use_empty=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

# Ensure scene collection exists
collection = bpy.data.collections.get("Collection")
if not collection:
    context = bpy.context
    collection = bpy.data.collections.new("Collection")
    context.scene.collection.children.link(collection)
`;

const EXPORT = (outputPath: string) => `
# Export
bpy.ops.export_scene.gltf(
    filepath=r"${outputPath}",
    export_format='GLB',
    export_apply=True,
    export_materials='EXPORT',
)
print("BLENDER_EXPORT_OK")
`;

const MATERIAL = (style: BlenderStyle) => {
  if (style === 'lowpoly') {
    return `
def mat(name, color, roughness=0.9, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m
primary = mat("Primary", (0.35, 0.52, 0.97), 0.9, 0.0)
accent = mat("Accent", (0.85, 0.55, 0.25), 0.7, 0.1)
`;
  }
  if (style === 'stylized') {
    return `
def mat(name, color, roughness=0.6, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m
primary = mat("Primary", (0.55, 0.75, 0.95), 0.6, 0.0)
accent = mat("Accent", (0.95, 0.75, 0.35), 0.5, 0.05)
`;
  }
  return `
def mat(name, color, roughness=0.4, metallic=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m
primary = mat("Primary", (0.45, 0.48, 0.52), 0.35, 0.7)
accent = mat("Accent", (0.25, 0.27, 0.3), 0.3, 0.85)
`;
};

function sanitizeBrief(brief: string): string {
  // Keep the brief out of Python interpolation except as a comment + name.
  // Strip quotes/newlines; templates do not embed the brief as code.
  return brief.replace(/["\r\n]/g, '').slice(0, 120) || 'model';
}

export function buildBlenderScript(input: BlenderTemplateInput): string {
  const style: BlenderStyle = input.style ?? 'pbr';
  const name = sanitizeBrief(input.brief);
  const body = `
${BASE(input)}
${MATERIAL(style)}
# --- Model: ${name} ---

def link(obj, mat=None):
    bpy.context.scene.collection.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    return obj

# Body: rounded cube with bevel (Blender 5: bevel modifier weights)
bpy.ops.mesh.primitive_cube_add(size=1.2, location=(0, 0, 0.6))
body = bpy.context.active_object
body.name = "Body"
link(body, primary)
mod = body.modifiers.new("Bevel", 'BEVEL')
mod.width = 0.12
mod.segments = 3
bpy.ops.object.modifier_apply(modifier="Bevel")

# Top detail: smaller cube, offset for visual interest
bpy.ops.mesh.primitive_cube_add(size=0.6, location=(0, 0, 1.45))
top = bpy.context.active_object
top.name = "Top"
link(top, accent)
mod2 = top.modifiers.new("Bevel", 'BEVEL')
mod2.width = 0.06
mod2.segments = 2
bpy.ops.object.modifier_apply(modifier="Bevel")

# Ring accent for metallic styles
bpy.ops.mesh.primitive_torus_add(major_radius=0.55, minor_radius=0.08, location=(0, 0, 0.6))
ring = bpy.context.active_object
ring.name = "Ring"
link(ring, accent)

# Ground-centre at origin for predictable placement: compute bbox, shift so min.z = 0
deps = bpy.context.evaluated_depsgraph_get()
mins, maxs = [], []
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        for corner in obj.bound_box:
            world = obj.matrix_world @ __import__('mathutils').Vector(corner)
            mins.append(world.z)
if mins:
    offset = -min(mins)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.transform.translate(value=(0, 0, offset))
${EXPORT(input.outputPath)}
`;
  return body;
}

/** Built-in quick test: low-poly crate used by the smoke test. */
export function buildCrateScript(outputPath: string): string {
  return buildBlenderScript({ brief: 'test crate', style: 'lowpoly', seed: 1, outputPath });
}
