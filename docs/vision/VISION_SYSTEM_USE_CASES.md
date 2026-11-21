# Vision System — Detailed Use Cases by Agent

**Document:** Real-world scenarios showing how agents will use vision to understand editor state  
**Date:** 2026-11-21  
**Status:** Reference guide for implementation + testing

---

## 1. Studio Copilot — Video Editing

### Use Case 1.1: "Add a zoom where I introduce the feature"

```
┌─────────────────────────────────────────────────────────────┐
│ STUDIO COPILOT WORKFLOW                                     │
└─────────────────────────────────────────────────────────────┘

USER SAYS:
  "Add a zoom where I introduce the feature"

COPILOT ACTION:
  1. Call analyzeViewport('studio')
     ├─ Screenshot current timeline
     ├─ Vision model analyzes
     └─ Returns:
        {
          app: 'studio',
          elements: [
            'timeline with 5 clips',
            'playhead at 24s',
            'caption "Feature Introduction" at 23–28s',
            'current frame shows demo UI'
          ],
          focus: 'timeline editing / caption selection',
          issues: [],
          suggestions: ['Zoom could highlight the new button at 25s']
        }

  2. Interpret: "There's a caption 'Feature Introduction' at 23–28s"

  3. Create zoom:
     {
       startMs: 23000,
       endMs: 28000,
       centerX: 640,
       centerY: 360,
       scale: 1.8,
       reason: 'Feature intro segment (23–28s)'
     }

  4. Apply to take

  5. Call validateComposition('screenshot_after', 'zoom should highlight the feature demo with good framing')
     └─ Returns: { valid: true, warnings: [], metrics: { alignment: 'good' } }

  6. Summary: "Added 1.8x zoom during your feature intro (23–28s). Framing looks good!"

RESULT:
  ✅ Zoom lands exactly where user described
  ✅ No guessing about timeline position
  ✅ Validation confirms framing is acceptable
  ✅ User saves time (no "try at 25s instead" request)
```

### Use Case 1.2: "Fix the caption at 30 seconds"

```
USER SAYS:
  "Fix the caption at 30 seconds — it overlaps the button"

COPILOT ACTION:
  1. Call analyzeViewport('studio')
     └─ Returns current state including existing captions

  2. Find caption near 30s (e.g., "Click to expand" at 28–32s)

  3. Reposition caption:
     - Move text down to avoid button overlap
     - Or reduce font size
     - Or change duration to 28–30s

  4. Call validateComposition('screenshot_after', 'caption should not overlap button')
     └─ Returns: { valid: true, ...}

  5. Summary: "Moved caption down. No longer overlapping the button."

RESULT:
  ✅ Copilot understands the specific overlap problem
  ✅ Fix is targeted, not guesswork
  ✅ Validation confirms it worked
```

### Use Case 1.3: "Retime these captions to match the audio"

```
USER SAYS:
  "Retime these captions to match the audio transitions at 15s, 45s, and 90s"

COPILOT ACTION:
  1. Call analyzeViewport('studio')
     ├─ See existing captions and their timings
     ├─ Understand current structure
     └─ Example: Currently captions at 10s, 40s, 85s

  2. Adjust:
     - Caption 1: 10s → 15s
     - Caption 2: 40s → 45s
     - Caption 3: 85s → 90s

  3. Apply changes

  4. Call validateComposition('screenshot_after', 'captions should align with audio transitions at 15s, 45s, 90s')

  5. Summary: "Moved 3 captions to match audio transitions. All aligned."

RESULT:
  ✅ Copilot sees and understands existing caption structure
  ✅ Changes are precise (no iteration needed)
  ✅ Validation confirms alignment
```

---

## 2. Motion Copilot — 3D Scene Generation

### Use Case 2.1: "Create a sci-fi barrel with metal rings"

```
┌─────────────────────────────────────────────────────────────┐
│ MOTION COPILOT WORKFLOW                                     │
└─────────────────────────────────────────────────────────────┘

USER SAYS:
  "Create a sci-fi barrel with metal rings"

COPILOT ACTION (via Blender Specialist):

  ATTEMPT 1:
  ─────────────
  1. Write Blender Python code:
     - Create cylinder (barrel)
     - Add 3 torus shapes around it (rings)
     - Apply metallic material

  2. Execute in Blender sandbox
     └─ Returns GLB at /tmp/barrel_v1.glb + preview PNG

  3. [NEW] Call scorePreview('/tmp/barrel_v1_preview.png', 'sci-fi barrel with metal rings', 'geometry')
     └─ Vision model analyzes render:
        {
          match: 0.62,
          issues: [
            'Missing base ring (bottom)',
            'Proportions are too tall (should be squatter)',
            'Rings don\'t appear metallic enough'
          ],
          suggestions: [
            'Add a 4th ring at the base',
            'Reduce cylinder height ratio',
            'Use more specular material for rings'
          ]
        }

  4. Interpret: "62% match — needs fixes. Let me try again."

  ATTEMPT 2:
  ─────────────
  5. Refine Blender code based on issues:
     - Add base ring
     - Adjust proportions (height/width)
     - Boost specularity on ring material

  6. Execute in Blender
     └─ Returns GLB at /tmp/barrel_v2.glb + preview PNG

  7. Call scorePreview('/tmp/barrel_v2_preview.png', 'sci-fi barrel with metal rings', 'geometry')
     └─ Vision model analyzes:
        {
          match: 0.84,
          issues: [
            'Minor: rings could be slightly thinner'
          ],
          suggestions: [],
          strengths: [
            'Good proportions',
            'Metallic appearance convincing',
            'Base ring adds nice weight'
          ]
        }

  8. Threshold reached (0.84 >= 0.80) → Done!

  9. Summary: "Generated sci-fi barrel with 4 metal rings. Looks great! (84% match, 2 iterations)"

RESULT:
  ✅ Iterative refinement fully automatic
  ✅ Vision feedback drives improvements
  ✅ User gets production-ready asset without micro-managing
```

### Use Case 2.2: "Make the barrel shorter and add more rings"

```
USER SAYS:
  "Make the barrel shorter and add more rings"

COPILOT ACTION:

  1. Current barrel is at /motion/scene_1/model.gltf (previously generated)

  2. Call analyzeViewport('motion')
     ├─ Capture viewport showing current scene
     ├─ Vision analyzes geometry:
     │  {
     │    elements: ['cylinder (barrel)', '4 torus (rings)', 'scene lighting'],
     │    focus: 'geometry editing',
     │    issues: ['barrel appears quite tall relative to width']
     │  }
     └─ Confirms current state

  3. Refine brief: "Shorter barrel (0.6x height) with 6 rings instead of 4"

  4. Regenerate in Blender
     ├─ Reduce cylinder height
     ├─ Add 2 more rings (6 total)
     └─ Render preview

  5. Call scorePreview(preview, 'shorter barrel with 6 metal rings', 'geometry')
     └─ { match: 0.89, issues: [], ...}

  6. Summary: "Shortened barrel, added 2 rings. Looks balanced. (89% match)"

RESULT:
  ✅ Copilot understands visual feedback
  ✅ Changes are proportional and visual
  ✅ No iteration needed (89% on first try with new brief)
```

---

## 3. Trace Copilot — 2D Vector Animation

### Use Case 3.1: "Create an animated ring rotating around a central dot"

```
┌─────────────────────────────────────────────────────────────┐
│ TRACE COPILOT WORKFLOW                                      │
└─────────────────────────────────────────────────────────────┘

USER SAYS:
  "Create an animated ring rotating around a central dot"

COPILOT ACTION:

  1. Create SVG project with:
     - Central circle (dot)
     - Ring (torus/circle outline)
     - Keyframe: ring at 0°, 90°, 180°, 270°, 360° (full rotation)

  2. Render static frames at key moments:
     - t=0s (start): Ring at 0°
     - t=0.25s (quarter): Ring at 90°
     - t=0.5s (halfway): Ring at 180°
     - t=1s (end): Ring at 360° (back to start)

  3. [NEW] Validate frame at t=0s:
     Call validateComposition('/tmp/trace_t0.svg', 'central dot with ring centered around it')
     ├─ Vision analyzes SVG markup
     └─ Returns:
        {
          valid: true,
          metrics: {
            alignment: 'good',    // ring is centered
            balance: 'good',      // dot in center
            contrast: 'good'      // colors distinct
          },
          warnings: []
        }

  4. Check consistency from t=0s to t=0.5s:
     Call checkConsistency('/tmp/trace_t0.svg', '/tmp/trace_t0.5.svg', 'scale')
     └─ Returns:
        {
          consistent: true,
          difference: 'Ring rotated 180° but maintained size and center point'
        }

  5. Check consistency from t=0.5s to t=1s:
     Call checkConsistency('/tmp/trace_t0.5.svg', '/tmp/trace_t1.svg', 'scale')
     └─ Returns:
        {
          consistent: true,
          difference: 'Ring completed rotation, returned to start position'
        }

  6. Summary: "Created animated ring rotating 360° around central dot. Tested across key frames. Animation is smooth and consistent."

RESULT:
  ✅ Animation validated without manual review
  ✅ Consistency checks pass (scale, position stable)
  ✅ Copilot confident enough to declare "done"
```

### Use Case 3.2: "Make the ring thicker and change it to a spiral"

```
USER SAYS:
  "Make the ring thicker and change it to a spiral"

COPILOT ACTION:

  1. Call analyzeViewport('trace')
     ├─ See current animation frame
     ├─ Vision notes: 'thin ring, circular path'
     └─ Understand starting point

  2. Regenerate SVG:
     - Increase stroke width (thicker ring)
     - Change rotation to spiral (translate outward while rotating)

  3. Render key frames

  4. Call validateComposition(new_frame, 'thicker ring in spiral motion')
     └─ Returns validation (should be good, but might flag if spiral is too extreme)

  5. Call checkConsistency(old_t0, new_t0, 'scale')
     └─ Returns: { consistent: false, difference: 'Ring is now thicker and follows spiral path instead of circle' }

  6. Summary: "Updated ring: now thicker and spirals outward as it rotates. Motion is consistent across frames."

RESULT:
  ✅ Visual changes confirmed by vision
  ✅ Consistency checks show what changed
  ✅ Validation ensures new design is sound
```

---

## 4. Document Drafter — Block-Structured Documents

### Use Case 4.1: "Create a document: title, intro, 2 code blocks, conclusion"

```
┌─────────────────────────────────────────────────────────────┐
│ DOCUMENT DRAFTER WORKFLOW                                   │
└─────────────────────────────────────────────────────────────┘

USER SAYS:
  "Create a technical document: title, intro paragraph, Python code block, JavaScript code block, conclusion"

COPILOT ACTION:

  1. Create document with blocks:
     - Heading: "Building a Vision System"
     - Paragraph: intro text
     - Code (Python): example code
     - Code (JavaScript): example code
     - Paragraph: conclusion

  2. Save to workspace

  3. [NEW] Call analyzeViewport('workspace')
     ├─ Capture rendered document
     └─ Vision analyzes layout:
        {
          app: 'workspace',
          elements: [
            'heading "Building a Vision System" (bold, large)',
            'paragraph with intro text',
            'python code block (syntax highlighted)',
            'javascript code block (syntax highlighted)',
            'conclusion paragraph'
          ],
          focus: 'document reading view',
          issues: [],
          suggestions: ['Consider adding table of contents']
        }

  4. Layout looks good! Copilot could optionally:
     - Add more visual structure
     - Insert TOC block
     - Add images/dividers

  5. Summary: "Document created with structure. Layout looks well-balanced. Added table of contents block."

RESULT:
  ✅ Copilot validates visual hierarchy
  ✅ Layout issues caught before user sees them
  ✅ Suggestions for improvement automatic
```

---

## 5. Chat Agent — General Visual Analysis

### Use Case 5.1: "What's the current state of my Motion project?"

```
┌─────────────────────────────────────────────────────────────┐
│ CHAT AGENT WORKFLOW                                         │
└─────────────────────────────────────────────────────────────┘

USER SAYS:
  "What's the current state of my Motion project?"

CHAT AGENT ACTION:

  BEFORE (without vision):
  ────────────────────────
  1. Take screenshot of Motion viewport
  2. Manually describe in prose:
     "I see a 3D scene with a cylinder and some lighting. The camera is at an angle..."
  3. Loss of structured data; agent can't query specific elements

  AFTER (with vision):
  ────────────────────
  1. Call analyzeViewport('motion')
     └─ Returns structured analysis:
        {
          app: 'motion',
          elements: [
            'cylinder (pale gray, metallic)',
            '2 point lights (warm)',
            '1 environment (simple gradient)',
            'camera at isometric angle'
          ],
          focus: 'scene editing / lighting',
          issues: ['Scene might be under-lit (shadows dark)'],
          suggestions: [
            'Add a fill light to brighten shadows',
            'Consider reflective plane underneath'
          ]
        }

  2. Use structured data:
     - Element count: 4 objects
     - Primary issue: lighting
     - Suggestions ready

  3. Response:
     "Your Motion scene currently has:
      • 1 cylinder (metallic)
      • 2 point lights (warm color)
      • 1 environment light
      
      The scene looks a bit under-lit (harsh shadows). I'd suggest adding a fill light
      to brighten the shadow side, or adding a reflective plane underneath the cylinder.
      
      Would you like me to adjust the lighting?"

RESULT:
  ✅ Structured answer instead of prose description
  ✅ Agent can reason about specific elements
  ✅ Actionable suggestions from vision
  ✅ User gets better analysis faster
```

### Use Case 5.2: "How does this look for a product showcase?"

```
USER SAYS:
  "I captured a video. How does this look for a product showcase?"

CHAT AGENT ACTION:

  1. User shares take (or agent looks at latest take in active project)

  2. Call analyzeViewport('studio')
     └─ Analyze current take/timeline

  3. Call validateComposition(take_preview_frame, 'professional product showcase')
     └─ Returns:
        {
          valid: true,
          warnings: [
            'Aspect ratio is 16:9 (good for web)',
            'Consider adding opening title card',
            'Pacing seems good but could use more dynamic camera motion'
          ],
          metrics: {
            balance: 'good',
            contrast: 'good',
            alignment: 'good'
          }
        }

  4. Response:
     "Your video looks solid for a product showcase! It has:
      ✅ Good balance and contrast
      ✅ Professional aspect ratio (16:9)
      ⚠️ Missing opening title card (would add polish)
      ⚠️ Could benefit from more dynamic zoom/pan (make it feel less static)
      
      Want me to add opening captions and a few more dynamic zooms?"

RESULT:
  ✅ Concrete feedback from vision + composition validation
  ✅ Agent understands visual quality, not just technical metrics
  ✅ Suggestions are actionable and specific
```

---

## 6. Blender Specialist (Refactored) — Asset Scoring

### Use Case 6.1: (Same as Motion Copilot 2.1, but now using unified system)

```
USER SAYS:
  "Create a sci-fi barrel with metal rings"

BEFORE (custom scoreRenderTool):
  └─ 50 lines of custom vision code in blender-specialist-agent.ts

AFTER (unified vision system):
  └─ Call visionTools.scorePreview() (single line)
     └─ All vision logic centralized in vision-system.ts

BENEFIT:
  ✅ No code duplication
  ✅ Easier to update vision prompts
  ✅ Same model selection logic for all agents
  ✅ Consistent error handling + fallback
```

---

## 7. Motion Studio — Multi-Track Composition Validation

### Use Case 7.1: "Validate final composite before export"

```
┌─────────────────────────────────────────────────────────────┐
│ MOTION STUDIO COPILOT WORKFLOW                              │
└─────────────────────────────────────────────────────────────┘

USER SAYS:
  "Export my composition"

COPILOT ACTION:

  1. Render a frame of the full multi-track composition

  2. [NEW] Call validateComposition(composite_preview, 'multi-track composition with 3 clips and effects')
     └─ Vision analyzes:
        {
          valid: true,
          warnings: [
            'Clip 2 and 3 have slight alignment offset (1px)',
            'Opacity blend on clip 3 might create visual artifact at edge'
          ],
          errors: [],
          metrics: { alignment: 'mostly good', balance: 'good' }
        }

  3. Render additional frame (different moment) to check consistency

  4. Call checkConsistency(frame1, frame2, 'alignment')
     └─ Returns: { consistent: true, ... }

  5. Summary:
     "Composition validated. Minor alignment offset between clips 2–3 (cosmetic).
      Ready for export. Suggested: fine-tune clip 3 opacity blend if you want perfection."

  6. Option to auto-fix or proceed

RESULT:
  ✅ Quality gate before export
  ✅ Issues flagged before they reach user
  ✅ Validation + suggestions save iteration
```

---

## Testing Scenarios

### Scenario A: Quick Validation Loop (Motion Copilot)

```
Iteration 1:
  Generate → Render → scorePreview (65% match) → Refine → 500ms

Iteration 2:
  Generate → Render → scorePreview (85% match) → Done! → 500ms

Total time: ~1s (excluding generation time)
Result: Asset ready without user guesswork
```

### Scenario B: Long Workflow (Studio Copilot)

```
User → analyzeViewport (3s) → Add zoom (1s) → validateComposition (2s) → Done
Total: 6s per edit

Result: Copilot understands context, makes precise edits
```

### Scenario C: Offline Fallback (Chat Agent, no API)

```
User asks: "What's on screen?"

Vision system:
  1. Try configured provider (GPT-4V) → Timeout
  2. Try Groq/Claude/others → No vision endpoint
  3. Fallback → Load SmolVLM2 (first time: 5s, cached: 2–3s)
  4. Return result using SmolVLM2

Total: 5–7s (first time), 2–4s (subsequent)
Result: Chat works offline if needed
```

---

## Summary Table: Vision Calls per Agent

| Agent | Primary Use | Secondary Use | Tertiary Use |
|-------|---|---|---|
| **Studio Copilot** | analyzeViewport (understand timeline) | validateComposition (verify edits) | — |
| **Motion Copilot** | scorePreview (validate renders) | analyzeViewport (inspect scene) | — |
| **Trace Copilot** | validateComposition (frame validation) | checkConsistency (animation check) | — |
| **Document Drafter** | analyzeViewport (inspect layout) | validateComposition (optional) | — |
| **Chat Agent** | analyzeViewport (general Q&A) | scorePreview (user asks) | validateComposition (user asks) |
| **Motion Studio** | validateComposition (pre-export gate) | checkConsistency (frame validation) | — |
| **Blender Specialist** | scorePreview (asset validation) | — | — |

---

**Status:** Ready for implementation.
