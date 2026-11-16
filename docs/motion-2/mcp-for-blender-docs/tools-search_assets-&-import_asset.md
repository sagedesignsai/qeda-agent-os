Tools

# search\_assets and import\_asset: Free Asset Libraries

search\_assets and import\_asset find and import HDRIs, PBR textures and 3D models from Poly Haven, Sketchfab and Poly Pizza.

`search_assets` searches a free asset library, and `import_asset` brings a result into your scene. Both take a `source`:

| Source | Best for | Licence |
| --- | --- | --- |
| [`polyhaven`](https://www.mcp-for-blender.com/docs/integrations/poly-haven) | HDRIs for lighting, PBR textures for surfaces, generic realistic models | CC0 |
| [`sketchfab`](https://www.mcp-for-blender.com/docs/integrations/sketchfab) | Specific real-world or realistic models, like a named car or a landmark | Varies; check each model |
| [`polypizza`](https://www.mcp-for-blender.com/docs/integrations/poly-pizza) | Stylised, very light low-poly models | CC0 or CC-BY |

For custom or unusual objects, [`generate_3d`](https://www.mcp-for-blender.com/docs/tools/generate-3d) is usually a better fit than any library. Each library must be switched on in the MCP for Blender sidebar; see its integration page for setup.

## [search\_assets](https://www.mcp-for-blender.com/docs/tools/assets#search_assets)

| Parameter | Description |
| --- | --- |
| `source` | `polyhaven`, `sketchfab` or `polypizza`. |
| `query` | What you're looking for, in plain words. Poly Haven search understands intent and synonyms ("couch" finds sofas). Required for Sketchfab. |
| `asset_type` | Poly Haven only: `hdris`, `textures`, `models` or `all`. |
| `category` | Poly Haven: a category path like `"Metal/Sheet & Corrugated"`. Sketchfab: comma-separated categories. Poly Pizza: e.g. `"Furniture & Decor"`, `"Nature"`, `"Animals"`. |
| `attributes` | Poly Haven only: filters like `{"weather": "clear"}`. An unknown key returns the valid ones. |
| `min_size_m` | Poly Haven only: minimum real-world texture size in metres. Use 2 or more for walls, floors and ground so textures don't visibly repeat. |
| `licence` | Poly Pizza only: `CC0` or `CC-BY`. |
| `animated` | Poly Pizza only: animated models only. |
| `limit` | Number of results (up to 50, default 20). |
| `previews` | Attach thumbnails of the first N results (up to 6; Poly Haven and Sketchfab). |

Results include each asset's `id`, which you pass to `import_asset`.

## [import\_asset](https://www.mcp-for-blender.com/docs/tools/assets#import_asset)

| Parameter | Description |
| --- | --- |
| `source` | `polyhaven`, `sketchfab` or `polypizza`. |
| `id` | The asset's id from `search_assets` (the UID for Sketchfab). |
| `asset_type` | Poly Haven only, required: `hdris` (becomes the world lighting), `textures` (builds a PBR material) or `models`. |
| `target_size` | Size in metres of the model's largest dimension (chair 1.0, car 4.5, cup 0.12). Required for Sketchfab, recommended for Poly Pizza, since library models come at arbitrary scale. |
| `apply_to` | Poly Haven textures: object names to put the material on. Without it, the material is created but unused, and is lost when the file is saved. |
| `resolution` | Poly Haven: `1k` (default), `2k`, `4k` or `8k`. Use 1k–2k for background, 4k for close-ups. |
| `file_format` | Poly Haven, optional: `hdr` or `exr` for HDRIs; `jpg`, `png` or `exr` for textures. |

## [Example](https://www.mcp-for-blender.com/docs/tools/assets#example)

```python
search_assets(source="polyhaven", query="worn wooden floor", asset_type="textures", min_size_m=2)
import_asset(source="polyhaven", id="<id from search>", asset_type="textures", apply_to=["Floor"], resolution="2k")

search_assets(source="polypizza", query="pine tree", licence="CC0")
import_asset(source="polypizza", id="<id from search>", target_size=6)
```

Copy

After importing, the AI checks the reported bounding box, puts the object on the ground, and looks at it with [`look`](https://www.mcp-for-blender.com/docs/tools/look).