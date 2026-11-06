Comprehensive Analysis: Admin → Motion System
1. SYSTEM OVERVIEW
The Motion subsystem is a complete keyframe-based vector motion graphics workstation integrated into SAGE Designs OS. It enables authenticated users to create, animate, publish, and embed SVG-based motion artifacts. The system is deeply integrated with the Admin panel, Projects workspace, Blog/CMS, and AI agent infrastructure.
2. DATABASE LAYER (lib/db/schema.ts)
Four core tables power the Motion system:
Table	Purpose	Key Columns
motion_projects	Core motion project records	id, userId, projectId (FK→projects), name, slug, width, height, durationMs, fps, data (JSONB full project), status (draft/published), version, publishedVersion, publishedData, thumbnailSvg, posterUrl
motion_renditions	Rendered video outputs	id, motionProjectId (FK), userId, version, kind (mp4/webm/poster), status (queued→ready/failed), url, storageKey, fps, width, height, durationMs, metadata (JSONB)
motion_embeds	Motion attached to blog posts	id, motionProjectId (FK), userId, blogPostId (FK→blog_posts), version, placement (inline/hero/sidebar), caption
motion_assets	Reusable vector/character library	id, userId, projectId (FK), name, kind (vector/scene/character/part/pose), source (upload/github/r2/ai/library/api), data (JSONB MotionAssetFragment), thumbnailSvg, license, attribution
Cascade rules: motion_projects.userId → user.id (CASCADE), motion_projects.projectId → projects.id (CASCADE), motion_renditions.motionProjectId → motion_projects.id (CASCADE), motion_embeds.motionProjectId → motion_projects.id (CASCADE), motion_embeds.blogPostId → blog_posts.id (CASCADE), motion_assets.userId → user.id (CASCADE), motion_assets.projectId → projects.id (SET NULL).
3. ROUTING & URL STRUCTURE
# Admin Navigation (components/admin/admin-sidebar.tsx:68)
{ href: '/admin/motion', label: 'Motion', icon: Film, shortcut: '⌐M' }

# Redirect Layer
/app/admin/motion/page.tsx                    # Redirects to last active project's motion gallery
/app/admin/motion/[motionId]/page.tsx         # Legacy redirect → links unlinked compositions to a project

# Project-Scoped Motion
/app/admin/projects/[id]/motion/page.tsx      # Motion compositions gallery for a project
/app/admin/projects/[id]/motion/[motionId]/page.tsx  # Full Motion Studio editor

# Public-Facing
/app/(public)/motion/[slug]/page.tsx          # Published motion artifact viewer

# API Routes
/app/api/motion/projects/route.ts             # GET/POST (agent API + MCP)
/app/api/motion/projects/[id]/route.ts        # GET/PATCH/DELETE
/app/api/motion/projects/[id]/render/route.ts  # POST queue render
/app/api/motion/ops/route.ts                   # POST apply semantic ops
/app/api/motion/preview/route.ts               # POST render frame previews
/app/api/motion/renditions/[id]/route.ts       # GET render status
/app/api/motion/[slug]/poster/route.ts         # GET public poster SVG
/app/api/admin/motion/[motionId]/renditions/route.ts  # GET renditions for admin
/app/api/admin/motion/ai-director/stream/route.ts     # POST AI Motion Director streaming
/app/api/admin/motion/ai-svg/stream/route.ts           # POST SVG AI generation streaming
4. STATE MANAGEMENT (Zustand Store — lib/motion/store.ts)
The store is composed of 8 slices (lib/motion/slices/types.ts), all merged via historyMiddleware:
4.1 Playback Slice (playback-slice.ts)
- State: currentTimeMs, isPlaying, isLooping, zoomRatio (px/sec, default 120), autoKeyframe, selectedElementId, selectedKeyframeIds, expandedElementIds, playbackSpeed, playbackDirection (forward/reverse)
- UI State: activePluginId, isCommandPaletteOpen, isTimelineCollapsed, isStaggerModalOpen, isAiCopilotOpen, isIsometricView, showSkeletonOverlay
- Actions: setPlayheadTime, togglePlay, togglePlayReverse, setIsLooping, setAutoKeyframe, setZoomRatio, setPlaybackSpeed, plugin/palette/timeline toggles
4.2 Selection Slice (selection-slice.ts)
- selectElement (auto-expands tracks, uncollapses ancestor groups)
- toggleExpandElement, selectKeyframe
- collapsedGroupIds + toggleCollapseGroup / collapseAllGroups / expandAllGroups
4.3 Tracks Slice (tracks-slice.ts)
- addPropertyTrack (creates track with initial keyframe at playhead, auto-expands element row)
- removePropertyTrack, addKeyframe (deduplicates within 10ms), updateKeyframe, deleteKeyframe
- Default values: scaleX/scaleY/opacity=1, fill/stroke from element attributes, x/y/rotation from attributes
4.4 Elements Slice (elements-slice.ts)
- updateElementAttribute(s), updateElementOrigin
- setElementGradientPaint (creates/converts gradient fill)
- removeGradientFromDefs, addGradientStop, updateGradientStop, deleteGradientStop
- cloneElement, removeElement, reorderElement (front/back/forward/backward)
- groupElements / ungroupElement
- Helper exports: ANIMATABLE_PROPERTIES map, getOrderedElementList (DFS traversal respecting collapsed groups), applyAutoKeyframesToElement
4.5 Project Slice (project-slice.ts)
- setProject, resetToDefault (SAGE Kinetic Emblem), clearWorkspace
- applyTemplate (instantiates composition templates)
- importSvgString (parse + append/replace), insertSvgAsLayer (with ID collision avoidance)
- insertMotionAssetFragment (compiles asset → element graph)
- setProjectDimensions, saveToDb (calls updateMotionProject server action, returns false on conflict/deletion)
- initFromDb (loads project, migrates legacy data, repairs x/y offset bugs)
4.6 Storyboard Slice (storyboard-slice.ts)
- ensureStoryboard, addScene, renameScene, setSceneIntent, resizeScene
- reorderScene, duplicateScene (clones elements + shifts keyframes), removeScene (removes elements)
- setActiveScene, focusScene (selects first element + moves playhead)
- assignElementToScene, addSourceRef, removeSourceRef
4.7 Audio Slice (audio-slice.ts)
- masterVolume, isAudioMuted, selectedAudioTrackId, isAudioModalOpen
- addAudioTrack, updateAudioTrack (syncs to motionAudioEngine), removeAudioTrack
- setAudioTrackStartTime, toggleAudioTrackMute
4.8 History Slice (history-slice.ts)
- past/future arrays (max 50 depth), canUndo/canRedo
- undo/redo (syncs playback engine, shows toast notifications)
- clearHistory
- cloneProject (structuredClone with JSON fallback)
- isHistoryOpActive / setHistoryOpActive (prevents history commits during undo/redo)
4.9 History Middleware (history-middleware.ts)
- Intercepts state changes, pushes clones to past, clears future
- Skips internal history ops via isHistoryOpActive() flag
5. PLAYBACK ENGINE (lib/motion/runtime/)
5.1 playback-driver.ts (Core driver)
- GSAP Timeline: Compiles project to gsap.core.Timeline via compileProjectToGsap
- Fallback RAF: If SVG not yet in DOM, uses requestAnimationFrame loop
- Audio sync: motionAudioEngine.syncPlayback() called on start/seek
- Functions: startPlaybackLoop, stopPlaybackLoop, seekPlayback, setPlaybackSpeedRuntime, setPlaybackDirectionRuntime, setPlaybackLoopRuntime, updatePlayheadPositionUi, invalidateCompiledTimeline
- DOM caching: Caches needle, mini-progress, timecode DOM nodes; refreshes every 2s
5.2 dom-renderer.ts (High-performance DOM updates)
- syncSvgDomAtTime(timeMs): Evaluates all element tracks and mutates DOM directly (no React re-renders)
- applyElementAnimationAtTime: Handles transforms, pathProgress (spline tracing), stroke draw-in, counter, progress ring, lower-third accent, text reveal, opacity/fill/stroke fallbacks
- formatTimecode: MM:SS.hh format
- Path length caching via WeakMap + Map
5.3 gsap-compiler.ts
- Compiles MotionProject → GSAP Timeline
- Maps 30+ EasingType values to GSAP easing strings
- Maps 30+ AnimatableProperty values to GSAP target keys
- Supports MotionPathPlugin, TextPlugin
- onUpdate callback provides progress + timeMs
5.4 audio-engine.ts
- Web Audio API-based multi-track audio engine
- syncPlayback, setMasterVolume, setMasterMuted, setTrackVolume, setTrackMuted, stopAll
5.5 transform-resolver.ts
- getElementTransformAtTime: Resolves x/y/rotation/scaleX/scaleY from tracks at a given time
5.6 resolve-element.ts
- resolveElementAtTime: Resolves all animated attributes (fill, stroke, opacity, etc.) at a given time
6. SEMANTIC OPS SYSTEM (lib/motion/ops/)
A pure-data mutation contract shared by the in-app copilot, HTTP API, and MCP server.
6.1 Op Types (ops/types.ts)
setCanvas, addElement, updateElement, deleteElement, duplicateElement,
reorderElement, groupElements, ungroupElement, setElementScene,
setTrack, deleteTrack, applyPose, setBoneRotation,
addScene, updateScene, removeScene, reorderScene, setActiveScene,
insertFragment, applyRecipe, setDefs, setAudio, restore
6.2 Element Specs (ops/elements.ts)
Declarative specs for addElement:
- KineticTextSpec (typewriter, blur-fade, slide-up, pop, etc.)
- LowerThirdSpec (broadcast title card)
- CounterSpec (rolling KPI number)
- ProgressRingSpec (circular gauge)
- BarChartSpec (vertical/horizontal bars)
- TextSpec, ShapeSpec (rect/circle/ellipse/polygon/star), PathSpec, GroupSpec, SplineTracerSpec
6.3 applyOps (ops/index.ts)
- Deep clones project, applies ops sequentially
- On any throw: returns original project, 0 applied, single diagnostic
- After success: runs lintProject, returns diff + diagnostics + optional inverse (restore op)
- Atomicity: All-or-nothing per batch
6.4 Element Recipes
- counter, progress-ring, bar-chart, kinetic-text, lower-third
7. LINT SYSTEM (lib/motion/lint/)
lintProject(project, options) checks:
- Element graph: Orphan detection, duplicate IDs, self-parenting, cycle detection
- Track integrity: Unknown properties, non-finite keyframe times, out-of-order keyframes, duplicate times, keyframes beyond duration
- Bounds: Elements far outside canvas, text overflow
- Audio: Missing URLs, tracks starting after project ends
- Defs: Missing gradient/pattern references (DEF_REF_MISSING)
- Returns { ok, diagnostics[], errorCount, warningCount }
8. FRONTEND COMPONENTS
8.1 Motion Studio Editor (components/motion-studio/)
Layout (motion-studio-view.tsx):
- Resizable 3-column layout (Elements Tree | Stage | Properties/Co-Pilot)
- Collapsible timeline dock at bottom
- Mini transport bar (docked)
- Global modals: Command Palette, Plugin Host, Export, Import SVG, Rename, Audio Library, Stagger Tracks
Header (motion-header.tsx):
- Project name (inline editable), save status indicator
- Undo/Redo, Reset to SAGE Emblem, Clear Workspace
- File menu: New (template library), Open (file picker), Save, Export (SVG/Video/GSAP code), Publish
- Tools: AI Motion Director, Command Palette
- View: Timeline collapse, Isometric view, Skeleton overlay
- Audio: Open audio library
Stage (motion-stage.tsx):
- Zoom/pan viewport with getCanvasFitZoom
- Isometric 2.5D view mode (rotateX(55deg) rotateZ(-45deg))
- Context menus (element + canvas)
- Transform gizmo overlay (moveable, hidden during playback)
- Skeleton overlay for character rigs
- Stage controls (zoom in/out, fit, isometric toggle)
Timeline (motion-timeline.tsx):
- Time ruler, element track lanes, property track rows with draggable keyframes
- Audio clip lanes (draggable)
- Synchronized vertical scroll between element list and track lanes
- Playhead needle (GPU-accelerated translate3d)
Elements Tree (elements-tree-panel.tsx):
- 4 tabs: Layers, Library (presets), Assets (motion assets), Backgrounds
- Search, collapse/expand all
- Per-element: visibility toggle, lock toggle, add track dropdown (10 animatable properties)
- Context menu (duplicate, delete, group, rename, assign to scene)
Properties Panel (motion-properties-panel.tsx):
- Context-aware inspector sections:
- TransformSection (x, y, rotation, scaleX, scaleY, origin)
- AppearanceSection (fill, stroke, opacity, gradients)
- KeyframeSection (easing curve preview, keyframe editor)
- AudioInspectorSection
- CharacterRigSection
- ParametricInspectorSection
Plugins (7 built-in, lib/motion/plugins/registry.ts):
1. background-motion-studio (Animated Backgrounds)
2. typography-fx-studio (Kinetic Typography)
3. motion-director (AI Motion Director)
4. motion-path-studio (GSAP MotionPath)
5. svg-path-editor (Vector Path Sculptor)
6. svg-ai-generator (Vector AI Studio)
7. svg-fx-studio (SVG Filter & FX)
Modals/Dialogs:
- NewCompositionModal (templates + dimension presets)
- ExportModal (SVG, Video, MP4, GSAP code)
- PublishMotionDialog (publish/unpublish, copy link, poster preview)
- ClearWorkspaceModal, TemplateLibraryModal, ProjectSettingsModal
- ImportSvgModal, RenameElementModal, AudioLibraryModal, StaggerTracksModal
- CharacterAssemblerModal, CharacterRigModal, PoseBrowserModal, PresetBrowserModal
8.2 AI Copilot (components/motion-studio/ai-copilot/)
use-motion-director-chat.ts (shared hook):
- Uses useChat from @ai-sdk/react with DefaultChatTransport
- Endpoint: /api/admin/motion/ai-director/stream
- Streams tool results, extracts updatedProject, animatedSvg, storyboardBeats, appliedTracksCount
- autoApply toggle: when on, automatically applies choreography to the live project
- 6 presets: Brand Intro & Typewriter, Spline Circuit Flow, Elastic Spring Cascade, Broadcast Lower-Third, KPI Metric & Ring, Ambient Floating Loop
motion-ai-copilot-panel.tsx:
- Slide-out panel with chat interface (Conversation + PromptInput components)
- Storyboard beat timeline view
- Parameter controls: duration, loop, target scope (all/selected), auto-apply
- Tool call display (motion-tool-call.tsx)
8.3 Public Player (components/motion/public/public-motion-player.tsx)
- Read-only artifact player using same MotionRenderer as editor
- GSAP-driven playback (no Zustand dependency)
- Poster image overlay, play/pause/restart/seek controls
- Fullscreen button, time display, progress bar
- Auto-play support
9. AI AGENT INTEGRATION
9.1 Motion Director Agent (lib/agents/sub-agents/motion-director-agent.ts)
Specialized ToolLoopAgent with tools:
- inspectMotionScene — Returns scene graph (element IDs, types, tracks, canvas dims, spline paths)
- applyKeyframeStoryboard — Applies animation tracks (30+ properties)
- createElement — Creates kinetic-text, lower-third, counter, progress-ring, text, rect, circle
- choreographTypography — Character/word staggers, typewriter, text-on-path
- attachSplineTracer — Attaches glowing particle tracers to spline paths
- inspectMotionTiming — Analyzes timing/rhythm
- compileAnimatedSvg — Compiles to standalone animated SVG
- manageSessionPlan — Session planning
Output includes storyboardBeats, updatedProject, animatedSvg, appliedTracksCount, optionally persists to workspaceArtifacts/workspaceArtifactVersions.
9.2 Motion Tools (lib/agents/tools/motion-tools.ts)
16 tool definitions with Zod schemas, including:
- inspectMotionSceneTool — Scene graph inspection
- createElementTool — Element creation with full spec support
- applyKeyframeStoryboardTool — Keyframe application (30+ properties)
- choreographTypographyTool — Advanced typography (staggers, typewriter, text-on-path)
- attachSplineTracerTool — Spline tracer attachment
- inspectMotionTimingTool — Timing analysis
- compileAnimatedSvgTool — Standalone SVG compilation
9.3 SVG Studio Agent (app/api/admin/motion/ai-svg/stream/route.ts)
SvgStudioAgent with tools:
- generateSvgGraphicTool — Generate vector graphics from prompts
- mutateSvgAstTool — Surgical SVG edits
- inspectSvgGeometryTool — Bounding box verification
- 12 style presets (cyberpunk, neon, minimal, etc.)
9.4 MCP Server (mcp/motion-server.ts)
Thin stdio client over HTTP agent API. Exposes tools:
- list_projects, get_project, create_project, update_project, delete_project
- apply_ops, lint_project, preview_project
- Auth via MOTION_API_TOKEN bearer token (validated against MOTION_API_USER_EMAIL)
10. RENDER PIPELINE (lib/motion/render/)
10.1 Workflow (render-motion-workflow.ts)
Trigger.dev durable workflow with steps:
1. prepareRenderStep: Load project, validate revision, create render plan
2. renderAndUploadStep:
- Create sandbox (Vercel or E2B)
- Write frames.json.gz bundle + encode.mjs script
- Run Playwright + FFmpeg in sandbox
- Parse progress (PROGRESS N/total)
- Upload MP4 to R2
- Update rendition row to ready
10.2 Render Plan (render/plan.ts)
Clamps project settings to H.264-compatible bounds:
- FPS: 1–60 (default 30)
- Max edge: 1920px (even dimensions)
- Max duration: 60s
- Max frames: 3600
- Background: #0b1020 (dark)
10.3 Frame Bundle (render/bundle.ts)
Serializes SVG frames + metadata as gzipped JSON (gzipSync, level 6).
10.4 Encode Script (render/encode-script.ts)
Node.js script executed in sandbox:
- Loads frames from frames.json.gz
- Uses Playwright (headless Chromium) to screenshot each SVG frame
- Runs FFmpeg to encode MP4 (libx264, yuv420p, CRF 20)
- Outputs PROGRESS N/total for progress tracking
10.5 Sandbox Drivers (render/sandbox/)
- Vercel (vercel.ts): Uses @vercel/sandbox with snapshot/image
- E2B (e2b.ts): Uses e2b SDK with template
- Provider selection (provider.ts): auto mode falls back from Vercel to E2B on 429/502/503/504
10.6 Preview (render/frames.ts)
Server-side rasterization via sharp:
- renderFrameSvg — Single frame SVG (used by poster route)
- renderFramePng — Single frame PNG
- renderFrameSheetPng — Contact sheet (max 12 frames, 720px wide, with timestamp labels)
- getFrameTimes — Evenly spaced sample times
10.7 Poster (render/poster.ts)
- getMotionPosterTimeMs: 70% of duration (after entrance animations settle)
- renderMotionPoster: Server-side React rendering via renderToStaticMarkup
- Uses same MotionRenderer component as editor and public player
11. PUBLISHING LIFECYCLE
11.1 publishMotionProject (app/actions/motion.ts:396)
1. Normalizes project for publish (editor snapshot wins)
2. Renders poster SVG
3. Increments version
4. Sets status: 'published', publishedData, publishedVersion, publishedAt, posterUrl, thumbnailSvg
5. Revalidates paths: /motion/[slug], /admin/motion, project motion pages
11.2 unpublishMotionProject
Sets status: 'draft', clears publishedAt.
11.3 Public Resolution (lib/queries/public-motion.ts)
- getPublishedMotionBySlug: Filters by status: 'published' (no userId filter — public)
- getPublishedMotionEmbedsForPost: JOINs motion_embeds + motion_projects for blog post embedding
- Poster served from /api/motion/[slug]/poster with immutable cache headers
12. ASSET MANAGEMENT (lib/motion/assets/)
12.1 Asset Types
- vector — Standalone SVG graphics
- scene — Multi-element compositions
- character — Full character with rig
- part — Modular character part (hair, torso, etc.)
- pose — Semantic pose catalog entry (no elements)
12.2 Asset Sources
- upload — User file upload
- github — From linked GitHub projects
- r2 — From R2 storage
- ai — AI-generated
- library — Built-in library
- api — DiceBear character API
12.3 Asset Pipeline
1. resolveMotionAssetSource — Resolves input to raw SVG bytes
2. normalizeSvgAsset — Normalizes vector tree
3. compile — Compiles to MotionAssetFragment (elements + rootElementIds + defs + gradients)
4. thumbnail — Generates thumbnail SVG
5. storage — Stores source, compiled data, thumbnail in R2
6. fragment — Validates fragment structure
12.4 DiceBear Integration (lib/motion/character/dicebear.ts)
- Fetches character styles and definitions from DiceBear API
- Converts to parts with slot assignments
- Batch imports (20 per chunk, retry on failure)
- Deduplication via checksum
13. CHARACTER RIG SYSTEM (lib/motion/rig/)
13.1 Rig Types (rig/types.ts)
- HumanoidRole: 23 bone roles (root, hips, spine, chest, neck, head, shoulders, arms, legs, feet)
- RigBone: id, role, parentId, partId
- RigPart: element→role mapping
- RigLayout: snapshot for unwrapping
- CharacterRig: version, kind, rootId, bones, parts, layout
13.2 Rig Operations (rig/pose.ts)
- applyPoseToRig: Applies bone rotations at a time
- setBoneRotationKeyframe: Sets keyframe for a specific bone
- compileHumanoidRig: Compiles element hierarchy into bone structure
- unwrapHumanoidRig: Restores original tree
13.3 Character Slots (lib/motion/character/slots.ts)
- 10 slots: back-hair, body-base, clothing-bottom, clothing-top, head-base, facial-features, facial-hair, glasses, front-hair, accessory
- Paint order (back to front)
- guessSlotFromName: Filename heuristics for bulk import
14. TEMPLATES & PRESETS (lib/motion/templates/)
14.1 Composition Templates (composition-templates.ts)
6 templates:
1. blank — Empty 1280×720 canvas
2. sage-emblem — 7-layer SAGE Kinetic Emblem (600×600, 4s)
3. metrics-infographic — KPI counter + radial gauge + bar chart
4. tech-intro — Kinetic typewriter + orbital rings
5. lower-third — Broadcast speaker card
6. Showcase templates (9): neon-hero-reveal, kinetic-typography, data-dashboard, motion-path-logo, product-launch, svg-morphing, tech-explainer, saas-product-demo, cloud-architecture, ai-pipeline-visualizer
14.2 Default Project (default-project.ts)
- SAGE Kinetic Emblem: 7 path layers with pre-authored keyframes
- Ambient glow, orbit ring, top/mid/right/bottom wings, core flare
- 4-second duration, 60fps, with storyboard scene
14.3 Animated Backgrounds (animated-backgrounds.ts)
- Template-specific animated backgrounds (gradients, glow, fills)
14.4 Fit-to-Canvas (fit-project-to-canvas.ts)
- Scales project to target dimensions while preserving aspect ratio
15. ANIMATION MATH (lib/motion/animation/)
15.1 Easing (easing.ts)
- 15+ named easing functions (linear, power1-4, ease/in/out/inOut, expo, circ, sine, back, elastic, bounce)
- Custom cubic-bezier support via Newton-Raphson solver
15.2 Interpolator (interpolator.ts)
- Binary search for keyframe lookup
- Number interpolation (lerp)
- Color interpolation (lerpColor)
- Text interpolation (typewriter: progressive slicing, backspace+type transition)
- Discrete jump at 50% for non-interpolatable properties
15.3 Color Math (color-math.ts)
- lerpNumber, lerpColor (hex/rgb support)
15.4 Stagger (stagger.ts)
- Staggered keyframe generation across multiple elements
16. ELEMENT TYPES (lib/motion/elements/)
16.1 Core (elements/core/)
- base-element.ts — Base motion element interface
- property-descriptor.ts — Property descriptors for inspectors
- transform-properties.ts — Transform handling
- registry.ts — Element definition registry
16.2 Concrete Elements
- text — Text with font, size, weight, anchor
- shape — Rect, circle, ellipse, polygon, star
- path — SVG path with d, closed, fill, stroke
- group — Container with children
- spline-tracer — Glowing particle tracer along paths
16.3 Stage Renderers (elements/stage-renderers.ts)
- Store-free SVG renderers for the shared MotionRenderer
- Renders: text, shape, rect, circle, polygon, path, group, spline-tracer
17. EXPORT SYSTEM (lib/motion/export/)
- svg-exporter — Download self-contained animated SVG
- video-exporter — Trigger render + poll for MP4
- gsap-code-generator — Generate React or vanilla GSAP code
18. ADMIN UI INTEGRATION
18.1 Navigation (components/admin/admin-sidebar.tsx:68)
- /admin/motion in sidebar with Film icon, shortcut ⌐M
18.2 Motion Redirect (app/admin/motion/page.tsx)
- Checks auth, reads last_active_project_id cookie
- Redirects to /admin/projects/[id]/motion (most recent or last active)
18.3 Legacy Redirect (app/admin/motion/[motionId]/page.tsx)
- If motion has no projectId, associates it with user's last active project
- Redirects to project-scoped editor
18.4 Project Motion Gallery (app/admin/projects/[id]/motion/page.tsx)
- Lists all motion compositions for a project
- ProjectMotionGallery component: grid of composition cards
- Each card: SVG thumbnail, name (inline editable), status badge, version, duration, time ago
- Actions: Open editor, rename, delete, publish toggle
- "New Composition" button opens NewCompositionModal
18.5 Motion Editor (app/admin/projects/[id]/motion/[motionId]/page.tsx)
- Auth check, project ownership verification
- Auto-links motion to project if mismatched
- Renders MotionStudioView with initial project data
19. SERVER ACTIONS (app/actions/motion.ts)
All actions use getCurrentUser() (Better Auth session):
- getMotionProjects(projectId?) — List user's motion projects (optionally filtered by project)
- getMotionProjectById(id) — Single project (user-scoped)
- createMotionProject(data) — Create with template instantiation, slug generation
- updateMotionProject(id, data) — Update metadata or data
- publishMotionProject(id, data?) — Publish with poster rendering
- unpublishMotionProject(id) — Unpublish
- deleteMotionProject(id) — Delete
- renderMotionVideo(projectId, fps) — Queue render job
20. MCP SERVER (mcp/motion-server.ts)
External agent access via stdio MCP:
- Auth: MOTION_API_TOKEN + MOTION_API_USER_EMAIL env vars
- Tools: list_projects, get_project, create_project, update_project, delete_project, apply_ops, lint_project, preview_project
- All tools proxy to /api/motion/* HTTP endpoints with bearer token
21. KEY DEPENDENCIES
- GSAP (gsap 3.15) + @gsap/react — Animation engine
- motion (framer-motion 12.42) — Present for UI animations
- Zustand 5 — State management
- AI SDK v7 (ai, @ai-sdk/react) — AI copilot + agent streaming
- Trigger.dev — Durable render workflows
- Vercel Sandbox / E2B — Remote render sandboxes
- Playwright + FFmpeg — Frame capture + video encoding
- sharp — Image rasterization
- Drizzle ORM + PostgreSQL (Supabase) — Persistence
- Better Auth — Authentication
- R2 (Cloudflare) — Asset/file storage
- streamdown — Markdown rendering in chat
- @xyflow/react — Node-based UIs (used in some plugins)
- sonner — Toast notifications
- shadcn/ui — UI primitives (base-nova style)
22. DATA FLOW SUMMARY
User/Admin UI
  → Zustand Store (client-side state)
    → Server Actions (app/actions/motion.ts) OR
    → HTTP API (app/api/motion/*) with withMotionAuth()
      → lib/queries/* (data access)
        → lib/db (Drizzle ORM → PostgreSQL)
          → motion_projects, motion_renditions, motion_embeds, motion_assets

AI Copilot / Agent
  → useChat (@ai-sdk/react) → /api/admin/motion/ai-director/stream
    → ToolLoopAgent (AI SDK) → motion-tools (semantic ops)
      → applyOps → lintProject → saveMotionProjectRow (DB transaction with FOR UPDATE lock)

Render Pipeline
  → createMotionRenderJob (advisory lock, one-active guard)
    → start(renderMotionWorkflow) [Trigger.dev]
      → prepareRenderStep → renderAndUploadStep
        → createRenderSandbox (Vercel/E2B)
          → write frames.json.gz + encode.mjs
          → run Playwright + FFmpeg
          → upload MP4 to R2
          → update motion_renditions → ready
23. NOTABLE DESIGN DECISIONS
1. Single shared renderer: MotionRenderer is used by editor stage, public player, and server-side poster generation — ensuring WYSIWYG consistency
2. DOM mutation during playback: syncSvgDomAtTime directly mutates SVG DOM nodes (no React re-renders at 60-120fps)
3. Optimistic concurrency: Revision tokens derived from updatedAt; SELECT ... FOR UPDATE locks rows during saves
4. Semantic ops as mutation contract: Pure data ops (no DOM, no DB, no random IDs unless omitted) shared by copilot, HTTP API, and MCP
5. Agent-first design: The ops API and MCP server are designed for external coding agents; the in-app copilot is a consumer of the same infrastructure
6. Dark mode only: No theme toggle; color-scheme: dark hardcoded
7. No built-in image optimization: next.config.mjs has images.unoptimized: true
8. TypeScript ignoreBuildErrors: next build won't catch TS errors; pnpm typecheck (tsc --noEmit) is the real gate