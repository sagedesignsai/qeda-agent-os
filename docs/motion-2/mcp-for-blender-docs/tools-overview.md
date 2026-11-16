Tools

# MCP for Blender Tools: Overview

MCP for Blender gives your AI a small set of tools: run Python in Blender, look at the result, read the scene, generate 3D models, import library assets, and load workflow guides.

Your AI writes Blender Python itself for modelling, layout, materials, animation, rigging and retopology. The MCP adds what Python can't do on its own: eyes, 3D generation, asset libraries, and workflow know-how. A few tools cover all of it.

| Tool | What it's for |
| --- | --- |
| [`execute_blender_code`](https://www.mcp-for-blender.com/docs/tools/execute-blender-code) | Run Python in your live Blender |
| [`look`](https://www.mcp-for-blender.com/docs/tools/look) | See the result: the viewport, a multi-angle sheet, the camera view, topology, the rig, or an animation strip |
| [`get_scene_info`](https://www.mcp-for-blender.com/docs/tools/get-scene-info) | A compact scene summary, one line per object |
| [`generate_3d`](https://www.mcp-for-blender.com/docs/tools/generate-3d) | Generate and import a model with Meshy, Tripo, Hunyuan3D or Hyper3D Rodin in one call |
| [`generate_gaussian_world`](https://www.mcp-for-blender.com/docs/integrations/world-labs#generation-workflow) | Generate a whole environment with World Labs Marble and import it as Gaussian splats (Blender 5.3+) |
| [`search_assets` / `import_asset`](https://www.mcp-for-blender.com/docs/tools/assets) | Poly Haven HDRIs, textures and models, Sketchfab models, Poly Pizza low-poly models |
| [`get_guide`](https://www.mcp-for-blender.com/docs/tools/overview#guides) | Workflow guides loaded only when needed: rigging, retopology, animation, level design and more |

## [How the AI uses them](https://www.mcp-for-blender.com/docs/tools/overview#how-the-ai-uses-them)

1.  **Read the scene** with `get_scene_info` to see what's there and at what scale.
2.  **Load a guide** with `get_guide` before rigging, retopology, animation, level design, scene building or materials work.
3.  **Build** with `execute_blender_code`, in small steps. Bring in assets with `generate_3d` or `search_assets` and `import_asset`, or a whole environment with `generate_gaussian_world`.
4.  **Check** each meaningful change with `look`, then fix anything floating, clipping, mis-scaled or hidden before moving on.

You don't need to name tools in your prompts. Describe what you want, and the AI picks the tools.

## [Guides](https://www.mcp-for-blender.com/docs/tools/overview#guides)

`get_guide` loads a workflow guide. Guides hold the craft knowledge for specific kinds of work, along with the Blender version pitfalls that break scripts. Your AI loads one before starting work in that area.

Guides cost nothing until they're loaded. Keeping this knowledge out of every conversation leaves more room for your actual work.

### [Available guides](https://www.mcp-for-blender.com/docs/tools/overview#available-guides)

| Guide | What it covers | Loaded before |
| --- | --- | --- |
| `bpy` | Version-proof scripting, looking up the API instead of guessing, operator context, and the mistakes that break scripts on other people's machines | Writing scripts that depend on the Blender version |
| `scene` | Building a believable scene: scale, grounding, composition, choosing between generated and library assets, lighting and camera | Building a scene |
| `level-design` | Game levels: player metrics, blockout, modular kits, instancing, collisions, and export to game engines | Designing a game level |
| `animation` | Keyframing from Python across Blender versions, easing, cycles, NLA, cameras, and checking motion with frame strips | Animating |
| `rigging` | Armatures from Python, Rigify for characters, skinning with automatic weights and how to fix it, and verifying deformation | Rigging a model |
| `retopology` | Turning generated or scanned meshes into clean, lighter geometry: cleanup, remeshing, decimation, UVs and baking detail back | Cleaning up or retopologizing a mesh |
| `materials` | Node-based materials that survive version and language changes, applying Poly Haven textures, real-world tiling, and procedural looks | Materials and texturing work |

### [Parameters](https://www.mcp-for-blender.com/docs/tools/overview#parameters)

| Parameter | Description |
| --- | --- |
| `topic` | The guide's name from the table above. An unknown name returns the list of available guides. |

### [Example](https://www.mcp-for-blender.com/docs/tools/overview#example)

```python
get_guide(topic="rigging")
```

Copy

### [Attaching a guide yourself](https://www.mcp-for-blender.com/docs/tools/overview#attaching-a-guide-yourself)

Each guide is also published as an MCP resource at `guide://<topic>`, such as `guide://retopology`. In clients that let you attach resources to a message, you can add a guide yourself, without waiting for the AI to load it.

You don't need to ask for guides. The AI loads the right one when your request touches that area, such as "rig this character" or "clean up this generated mesh".