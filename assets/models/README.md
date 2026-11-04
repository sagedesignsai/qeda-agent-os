# 3D Models (GLB) for Motion's `model.gltf` node

Curated set of publicly available GLTF/GLB models for use in the Motion system.
All files validated as GLB (magic `glTF`).

## Source: Khronos glTF Sample Assets
Repo: https://github.com/KhronosGroup/glTF-Sample-Assets
License: CC-BY 4.0 or CC0 (per model; see each model's README in the repo)
Direct download pattern: `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/<Name>/glTF-Binary/<Name>.glb`

| File | Source model | Notes |
|---|---|---|
| khronos/Avocado.glb | Avocado | Natural object, CC0 |
| khronos/BarramundiFish.glb | Barramundi Fish | CC0 |
| khronos/BoomBox.glb | Boom Box | CC0 |
| khronos/BrainStem.glb | BrainStem | Skinned/animated (Poser EULA) |
| khronos/CarConcept.glb | Car Concept | CC-BY 4.0 (Khronos logos) |
| khronos/CesiumMan.glb | Cesium Man | CC-BY 4.0 |
| khronos/CesiumMilkTruck.glb | Cesium Milk Truck | CC-BY 4.0 |
| khronos/ChairDamaskPurplegold.glb | Chair Damask Purplegold | CC-BY 4.0 (sheen) |
| khronos/ChronographWatch.glb | Chronograph Watch | CC-BY 4.0 |
| khronos/CommercialRefrigerator.glb | Commercial Refrigerator | CC-BY 4.0 |
| khronos/AntiqueCamera.glb | Antique Camera | CC0 (trademarked UX3D logo) |

## Source: three.js examples (MIT)
Repo: https://github.com/mrdoob/three.js
License: MIT (code); model licenses vary; check each model's origin.
Direct download pattern: `https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/<name>.glb`

| File | Notes |
|---|---|
| threejs/Horse.glb | Animated horse |
| threejs/Soldier.glb | Animated soldier |
| threejs/Duck.glb | Classic duck |
| threejs/Michelle.glb | Character |
| threejs/LittlestTokyo.glb | Scene |
| threejs/Xbot.glb | Rigged character |
| threejs/Parrot.glb | Animated parrot |
| threejs/Flamingo.glb | Animated flamingo |
| threejs/ferrari.glb | Car |
| threejs/rolex.glb | Watch |
| threejs/SheenChair.glb | Chair (sheen) |
| threejs/steampunk_camera.glb | Camera prop |
| threejs/coffeeMug.glb | Mug |
| threejs/kira.glb | Character |
| threejs/pool.glb | Pool scene |
| threejs/Stork.glb | Bird |
| threejs/facecap.glb | Face capture |
| threejs/gears.glb | Gears |
| threejs/tennyson-bust.glb | Bust |
| threejs/venice_mask.glb | Mask |

## Usage in Motion
Import a GLB into a Motion project via the asset pipeline (`motion:pick-assets` / `motion:commit-assets`)
so it becomes a `MotionAsset` of kind `'model'`, then reference its id from a `model.gltf` node's
`assetId` prop. See `src/lib/motion/nodes/model.ts` and `src/components/motion/scene/nodes/model.tsx`.
For placeholder demos, set `missingAsset: true` with an `assetId` (see `templates.ts` `model-reveal`).
