

Core Concepts
MCP for Blender Capabilities: What You Can Build

MCP for Blender lets your AI build scenes, generate and import assets, animate, rig and retopologize in Blender by writing Python, checking its work visually, and loading workflow guides.

MCP for Blender gives your AI client a toolkit of actions in Blender, from reading scene state to downloading production-ready assets.
Capability Overview
Scene Generation

Build complete scenes from a prompt: layout, props, lighting, HDRI environments, and cameras.
Asset Generation

Generate custom 3D models from text or reference images with Hyper3D Rodin, Hunyuan3D, Tripo, and Meshy.
Animation

Keyframe objects, cameras, and lights, and set up turntables, camera moves, and timeline ranges.
Rigging

Add armatures, bones, constraints, and weight parenting so models are ready to pose and animate.
Scene Inspection

Get a compact summary of every object: location, size, grounding, materials, modifiers and animation.
Object Manipulation

Create, move, rotate, scale, rename, and delete objects using natural language prompts.
Material Control

Assign and configure materials, textures, and shaders on any object in the scene.
Code Execution

The AI writes Blender Python (bpy) for modelling, layout, materials, animation, rigging and retopology.
Asset Integration

Search and download HDRIs, textures, and 3D models from Poly Haven, Sketchfab, Poly Pizza, Hyper3D, Hunyuan3D, Tripo, and Meshy, and generate whole Gaussian splat worlds with World Labs.
Visual Verification

The AI checks its own work from several angles, through the camera, or as topology, rig and animation views.
Workflow Guides

On-demand guides for rigging, retopology, animation, level design, scene building and materials.
Use Cases

See how these capabilities come together for specific kinds of work.
Gaming

Game-ready assets, low-poly environments, and level prototypes.
Architecture

Architectural scenes with PBR materials, lighting, and furniture.
Scientific Visualization

Molecular models, geographic representations, and data-driven scenes.
Robotics Simulation

Simulation environments, obstacle courses, and sensor test scenes.
Filmmaking & VFX

Cinematic scenes, camera setups, hero assets, and environment lighting.
Asset Creation

Production-ready assets generated from text prompts or reference images.
Scene Generation

Complete scenes that combine library assets and AI generation in one workflow.
What People Have Made

These were built by people describing what they wanted to an LLM connected to Blender through MCP for Blender.
insane stuff made in threejs | blender - almost get butterflies in my stomach when i see these the sun reflect on metal surface@chetanankola
GPT-6 Astra & Opus 5.5 + Unreal + Blender This is my last post about this project. My 16GB MacBook is starting to struggle with Unreal, so I’m thinking about going back to Godot and making a different game instead. I’ll leave a short summary below@seftsaint
dude GPT-6 Astra is some kind of turbo-AGI machine god for 3D games. It one-shot this in 45 minutes for hardly a couple % of my quota. I figured out how to get great graphics out of it. The trick is image gen. I'll share the process below.@anshuc
I asked Astra to make a photorealistic bat in Blender, and it just kept going until I ran out of tokens. This is AGI.@aollivier82
just asked gpt-5.6 sol in cursor to set up blender mcp and make me a realistic floating macbook, then render the whole thing. never opened blender once in my life before today.@prasenx
Blenderを自分では一度も触らずにAIのみでBlenderシーンを作るテスト途中 モデリングも含めてAIのみという縛り なるべくクオリティ出るようにやり方組み合わせた@Yokohara_h

See everything people have made →
Tools

A few tools cover all of this. Your AI writes Blender Python itself with execute_blender_code, checks its work with look, reads the scene with get_scene_info, brings in models with generate_3d, search_assets and import_asset, and loads workflow guides with get_guide. See the Tools overview for details on each.
Limitations

Complex operations may need to be broken into smaller steps. The AI client works best with incremental, explicit instructions rather than single large prompts that try to do everything at once.

Blender must be running with a GUI. Headless mode (blender -b) is not supported unless you use xvfb-run -a blender to provide a virtual display.

Only one MCP server instance can connect to Blender at a time. Do not run both Cursor and Claude Desktop against the same Blender session simultaneously.
