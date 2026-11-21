# Motion System: Complete Documentation Index

**Status:** Production-ready 3D scene editor  
**Last Updated:** 2026-11-21  
**Organization:** 25 documents organized by category

---

## Quick Navigation

### 📘 For Implementation & Debugging

**Start here if you're writing code, fixing bugs, or adding features:**

1. **MOTION_INSPECTION_INDEX.md** — Navigation guide with cross-references
2. **MOTION_QUICK_REFERENCE.md** — One-page cheat sheet (file locations, shortcuts, common tasks)
3. **MOTION_PATTERNS_GUIDE.md** — 17 design patterns with code examples
4. **MOTION_ARCHITECTURE_DIAGRAM.md** — 15 visual diagrams (data flow, components)
5. **MOTION_SYSTEM_INSPECTION.md** — Complete technical reference

### 🏗️ For Architecture & Design

**Start here if you're understanding the system design or planning features:**

1. **00-overview.md** — High-level system overview
2. **op-contract-v2.md** — Operation system specification
3. **document-model-v4.md** — Data model (schemas, types)
4. **runtime-state-machines.md** — State management architecture
5. **export-pipeline.md** — Export and rendering system

### 🛠️ For Feature Implementation

**Start here if you're implementing a specific feature:**

1. **inspector-and-hierarchy.md** — UI components and panels
2. **scenes-and-nodes.md** — Scene graph and node system
3. **timeline.md** — Timeline and animation system
4. **copilot-tools.md** — AI copilot tool integration
5. **copilot-ui.md** — Chat UI and streaming

---

## Document Organization

### NEW INSPECTION DOCS (2026-11-21)
**Comprehensive implementation-focused documentation**

| Document | Lines | Focus | Audience |
|----------|-------|-------|----------|
| MOTION_INSPECTION_INDEX.md | 386 | Navigation, cross-reference | Everyone |
| MOTION_QUICK_REFERENCE.md | 380 | Cheat sheet, quick lookup | Developers |
| MOTION_PATTERNS_GUIDE.md | 575 | Design patterns, best practices | Architects, developers |
| MOTION_ARCHITECTURE_DIAGRAM.md | 551 | Visual architecture, data flow | Everyone |
| MOTION_SYSTEM_INSPECTION.md | 749 | Complete technical reference | Technical leads |
| MOTION_INSPECTION_SUMMARY.txt | 480 | Executive summary | Managers, leads |

**Total:** 3,121 lines of implementation reference

### SPECIFICATION DOCS (2024-2026)
**Design documents and system specifications**

| Document | Purpose |
|----------|---------|
| 00-overview.md | System overview and architecture |
| op-contract-v2.md | Operation system design |
| document-model-v4.md | Data model schemas |
| runtime-state-machines.md | State management |
| phase-0-foundation.md | Foundation phase plan |
| export-pipeline.md | Export and rendering |
| persistence.md | Storage and serialization |
| testing-and-qa.md | Testing strategy |

### FEATURE DOCS (Subsystems)

**Scene & Rendering:**
- scenes-and-nodes.md
- gltf-and-environments.md
- asset-marketplace.md
- assets.md
- color-and-text.md

**Timeline & Animation:**
- timeline.md
- audio-and-sequence.md

**UI & Tools:**
- inspector-and-hierarchy.md
- copilot-ui.md
- copilot-tools.md
- templates-and-browser.md

### LEGACY SPECS (Reference)

**Root docs directory:**
- motion-2-spec.md — Original v2 specification (240 KB)
- motion-studio-spec.md — Studio integration spec (25 KB)

---

## By Use Case

### Adding a Node Type

1. Read: **MOTION_QUICK_REFERENCE.md** → "Add a Node Type"
2. Reference: **scenes-and-nodes.md** → Node system
3. Implement: Follow **MOTION_PATTERNS_GUIDE.md** → Pattern 7
4. Check: **MOTION_PATTERNS_GUIDE.md** → "New Feature Checklist"

### Building a Feature

1. Understand: **MOTION_SYSTEM_INSPECTION.md** → Relevant section
2. Find pattern: **MOTION_PATTERNS_GUIDE.md** → 17 patterns
3. Locate code: **MOTION_QUICK_REFERENCE.md** → "File Locations"
4. Implement: Copy nearby code, follow pattern
5. Test: Use undo/redo, verify ops record

### Implementing AI Tool

1. Overview: **copilot-tools.md** → Tool architecture
2. Patterns: **MOTION_PATTERNS_GUIDE.md** → Pattern 17
3. Reference: **MOTION_SYSTEM_INSPECTION.md** → "AI Copilot Agent"
4. Example: Study existing tool in `src/main/tools/motion*.ts`

### Debugging Performance

1. Theory: **MOTION_ARCHITECTURE_DIAGRAM.md** → Diagram 3 (Rendering)
2. Pattern: **MOTION_PATTERNS_GUIDE.md** → Pattern 4 (External Clock)
3. Practice: **MOTION_QUICK_REFERENCE.md** → "Performance Tuning"
4. Verify: Use DevTools, check frame timing

### Integrating with Other Systems

1. Vision: **MOTION_ARCHITECTURE_DIAGRAM.md** → Diagram 14 (Integrations)
2. Spec: **motion-studio-spec.md** or **motion-2-spec.md** (as applicable)
3. Examples: **MOTION_SYSTEM_INSPECTION.md** → "Integration Points"

---

## Key Metrics at a Glance

```
Components:          50+ React components
Node Types:          50+ registered types
Operations:          50+ op types
Tool Types:          8 copilot tools
Rendering:           60fps, independent of React
Document Size:       1–5 MB typical
Undo Stack:          200 documents max
```

---

## Document Relationships

```
MOTION_INSPECTION_INDEX.md (Navigation hub)
├── Explains all other docs
├── Cross-references every section
└── Reading guides by use case

MOTION_SYSTEM_INSPECTION.md (Technical reference)
├── Explains what each component does
├── References MOTION_QUICK_REFERENCE.md for file locations
└── References MOTION_PATTERNS_GUIDE.md for best practices

MOTION_ARCHITECTURE_DIAGRAM.md (Visual reference)
├── Shows data flow (from user action to render)
├── References MOTION_PATTERNS_GUIDE.md for patterns
└── Complements MOTION_SYSTEM_INSPECTION.md text

MOTION_PATTERNS_GUIDE.md (Implementation guide)
├── Shows HOW to implement features
├── References file locations in MOTION_QUICK_REFERENCE.md
└── Explains patterns from MOTION_SYSTEM_INSPECTION.md

MOTION_QUICK_REFERENCE.md (Developer cheat sheet)
├── File locations for every system
├── Common tasks with code snippets
└── Quick lookup for shortcuts, debugging
```

---

## Knowledge Gaps to Specs

| Question | Where to Look |
|----------|---------------|
| What is Motion? | 00-overview.md |
| How does the data model work? | document-model-v4.md, MOTION_SYSTEM_INSPECTION.md |
| How do operations work? | op-contract-v2.md, MOTION_PATTERNS_GUIDE.md |
| How does rendering work? | export-pipeline.md, MOTION_ARCHITECTURE_DIAGRAM.md |
| How does timeline work? | timeline.md, audio-and-sequence.md |
| How does AI copilot work? | copilot-tools.md, copilot-ui.md, MOTION_SYSTEM_INSPECTION.md |
| How do I add a feature? | MOTION_PATTERNS_GUIDE.md, MOTION_QUICK_REFERENCE.md |
| How do I debug? | MOTION_QUICK_REFERENCE.md, MOTION_ARCHITECTURE_DIAGRAM.md |
| How do I optimize? | MOTION_PATTERNS_GUIDE.md (Pattern 4), MOTION_QUICK_REFERENCE.md |
| How does persistence work? | persistence.md, MOTION_SYSTEM_INSPECTION.md |

---

## Reading Paths

### Path A: I'm New to Motion
```
1. 00-overview.md                    (What is this?)
2. MOTION_INSPECTION_SUMMARY.txt     (10-minute overview)
3. MOTION_ARCHITECTURE_DIAGRAM.md    (How do pieces fit?)
4. MOTION_QUICK_REFERENCE.md         (Quick lookup)
```
**Time:** ~30 minutes

### Path B: I'm Building a Feature
```
1. MOTION_QUICK_REFERENCE.md         (File locations, patterns)
2. MOTION_PATTERNS_GUIDE.md          (Find your pattern)
3. MOTION_SYSTEM_INSPECTION.md       (API details)
4. Locate similar code in codebase
```
**Time:** ~1 hour

### Path C: I'm Debugging
```
1. MOTION_QUICK_REFERENCE.md → "Debugging Checklist"
2. MOTION_ARCHITECTURE_DIAGRAM.md    (Trace data flow)
3. MOTION_PATTERNS_GUIDE.md          (Check pattern)
4. DevTools + breakpoints
```
**Time:** ~30 minutes + debugging

### Path D: I'm Optimizing Performance
```
1. MOTION_ARCHITECTURE_DIAGRAM.md → Diagram 3
2. MOTION_PATTERNS_GUIDE.md → Pattern 4
3. MOTION_QUICK_REFERENCE.md → "Performance Tuning"
4. Profile + measure
```
**Time:** ~1 hour + profiling

### Path E: I'm Adding AI Capability
```
1. copilot-tools.md
2. MOTION_SYSTEM_INSPECTION.md → "AI Copilot Agent"
3. MOTION_PATTERNS_GUIDE.md → Pattern 17
4. Study existing tool code
```
**Time:** ~2 hours

---

## File Locations Cheat Sheet

**Core Implementation:**
- Editor: `src/components/motion/MotionEditor.tsx`
- Store: `src/hooks/use-motion-store.ts`
- Types: `src/lib/motion/types.ts`
- Operations: `src/lib/motion/ops.ts`

**Rendering:**
- Canvas: `src/components/motion/scene/MotionSceneCanvas.tsx`
- Renderers: `src/components/motion/scene/nodes/` (50+ files)

**AI:**
- Copilot: `src/main/ai/motion-copilot-agent.ts`
- Tools: `src/main/tools/motion*.ts` (4 files)

**For detailed map:** See **MOTION_QUICK_REFERENCE.md** → "File Locations"

---

## Keyboard Shortcuts Quick Reference

| Shortcut | Action |
|----------|--------|
| `1` / `2` | Cinematic / editorial view |
| `W` / `R` / `E` | Translate / rotate / scale mode |
| `Space` | Play/pause |
| `Cmd/Ctrl+S` | Save |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+T` | Toggle timeline |
| `Shift+A` | Add node dialog |

**Complete list:** See **MOTION_QUICK_REFERENCE.md**

---

## Troubleshooting

| Issue | Where to Look |
|-------|---|
| "Why doesn't my change appear?" | MOTION_QUICK_REFERENCE.md → "Debugging Checklist" |
| "How do I add a node type?" | MOTION_PATTERNS_GUIDE.md → Pattern 7 |
| "Why is rendering janky?" | MOTION_PATTERNS_GUIDE.md → Pattern 4 |
| "Where is this component?" | MOTION_QUICK_REFERENCE.md → "File Locations" |
| "What ops do I need?" | op-contract-v2.md or MOTION_SYSTEM_INSPECTION.md |
| "How do I call an AI tool?" | MOTION_QUICK_REFERENCE.md → "AI Copilot Integration" |

---

## Contributing Guidelines

When adding documentation:

1. **Update this README** if adding a new section or doc
2. **Cross-reference** to related docs using markdown links
3. **Include code examples** where applicable
4. **Use the same structure** as existing docs (Overview, Details, Examples)
5. **Keep it current** — dates matter in docs

---

## Document Stats

```
New Inspection Docs:        6 files, 3,121 lines
Specification Docs:         8 files
Feature Docs:               10 files  
Legacy Specs:               2 files (reference)
Total Motion Documentation: ~25 documents, 50+ KB
```

---

**Status:** Complete and organized  
**Next Update:** As new features are implemented  
**Maintainer:** Motion development team

For questions about specific documents, see **MOTION_INSPECTION_INDEX.md** → "Cross-Reference Index"
