Tools

# execute\_blender\_code: Run Python in Blender

execute\_blender\_code runs Python in your live Blender session with bpy, bmesh and mathutils, and returns whatever the script prints.

`execute_blender_code` runs Python in your live Blender, with `bpy`, `bmesh` and `mathutils` available. Whatever the script prints is returned to the AI. Errors come back with the full traceback, so the AI can fix the script and try again.

This is where the real work happens: modelling, layout, materials, lighting, animation, rigging and retopology are all done by the AI writing Blender Python.

## [Parameters](https://www.mcp-for-blender.com/docs/tools/execute-blender-code#parameters)

| Parameter | Description |
| --- | --- |
| `code` | The Python to run. |

## [Example](https://www.mcp-for-blender.com/docs/tools/execute-blender-code#example)

```python
import bpy

bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5))
cube = bpy.context.active_object
cube.name = "Crate"
print(cube.dimensions)
```

Copy

## [Writing scripts that work on any Blender](https://www.mcp-for-blender.com/docs/tools/execute-blender-code#writing-scripts-that-work-on-any-blender)

Scripts run in someone else's Blender, whose version, language and add-ons the AI doesn't know. The [`bpy` guide](https://www.mcp-for-blender.com/docs/tools/overview#guides) covers the details. The most important rules:

-   Look shader nodes up by type, never by name, because names are localized: `next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")`.
-   Never hardcode enum identifiers. Read them from the API instead.
-   Material colours go on shader node inputs. `material.diffuse_color` only affects the viewport.

`execute_blender_code` runs arbitrary Python with full access to Blender and your file system. Save your work first. To limit what scripts can do, turn on [safe mode](https://www.mcp-for-blender.com/docs/reference/configuration#safe-mode).