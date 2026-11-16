Tools

# look: See the Blender Scene

look returns an image of your Blender scene so the AI can check its own work: the viewport, a multi-angle sheet, the camera view, topology, the rig, or an animation strip.

`look` gives the AI eyes. Each call returns one image, plus stats for some modes, so the AI can check its work after each change instead of trusting its own code.

Every setting changed to take the picture is restored afterwards, so your viewport stays as you left it.

## [Modes](https://www.mcp-for-blender.com/docs/tools/look#modes)

| Mode | What it shows | Use it for |
| --- | --- | --- |
| `viewport` (default) | Exactly what your 3D viewport shows | Seeing what you see |
| `angles` | A contact sheet of the target from several sides (default front, right, top, three-quarter), auto-framed | Shape, proportions, placement and clipping |
| `camera` | The view through the scene camera, at the render aspect ratio | Composition |
| `topology` | Wireframe on matcap, plus per-mesh counts: tris, quads, ngons, non-manifold and boundary edges, loose vertices, poles | Retopology and mesh cleanup |
| `rig` | X-ray with bones in front, plus armature stats and unweighted vertex counts | Rigging and skinning |
| `frames` | A strip of animation frames, evenly spaced over the frame range or at chosen frames | Judging motion |

## [Parameters](https://www.mcp-for-blender.com/docs/tools/look#parameters)

| Parameter | Description |
| --- | --- |
| `mode` | One of the modes above. Defaults to `viewport`. |
| `target` | Object names to frame, children included. Defaults to every visible object. |
| `views` | For `angles`, `topology` and `rig`: any of `front`, `back`, `left`, `right`, `top`, `three_quarter` (up to 6). `topology` and `rig` default to a single three-quarter view. |
| `shading` | Override the viewport shading for this image: `solid`, `material`, `rendered` or `wireframe`. Materials only show in `material` or `rendered`. `rendered` can be slow in Cycles. |
| `frames` / `frame_count` | For `frames` mode: explicit frame numbers, or how many to sample (2–12, default 6). |
| `view` | For `frames` mode: `camera`, an angle name, or leave it out to use your viewport. |
| `max_size` | Longest side of the image in pixels (200–2000, default 1000). |

## [Examples](https://www.mcp-for-blender.com/docs/tools/look#examples)

```python
look(mode="angles", target=["Chair"])            # check a chair from four sides
look(mode="camera", shading="material")          # check composition with materials
look(mode="topology", target=["Generated_Rock"]) # inspect a generated mesh
look(mode="frames", view="camera", frame_count=8) # judge an animation
```

Copy

In clients that support MCP Apps, such as the [Codex plugin](https://www.mcp-for-blender.com/docs/codex-plugin), `look` images also appear in a live viewport inside the chat.