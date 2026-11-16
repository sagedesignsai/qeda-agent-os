Tools

# get\_scene\_info: Read the Blender Scene

get\_scene\_info returns a compact summary of the open Blender scene: render and frame settings, then one line per object with location, size, grounding, materials, modifiers and animation.

`get_scene_info` returns a compact summary of the open scene: render and frame settings first, then one line per object with its:

-   world location and world-space size
-   whether it sits on the ground
-   face count
-   materials, modifiers and animation

By default it lists top-level objects only. Pass `root` to drill into one object's hierarchy, or `query` to find objects by name. For anything deeper about a single object, the AI reads it with [`execute_blender_code`](https://www.mcp-for-blender.com/docs/tools/execute-blender-code).

## [Parameters](https://www.mcp-for-blender.com/docs/tools/get-scene-info#parameters)

| Parameter | Description |
| --- | --- |
| `root` | An object whose whole hierarchy to list. |
| `query` | List every object whose name contains this text. |
| `limit` | Maximum number of object lines. Defaults to 50. |

## [Examples](https://www.mcp-for-blender.com/docs/tools/get-scene-info#examples)

```python
get_scene_info()                  # top-level overview
get_scene_info(root="Character")  # a rig and everything parented to it
get_scene_info(query="chair")     # every object with "chair" in its name
```