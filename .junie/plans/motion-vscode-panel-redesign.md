# Motion Scene Panel → VS Code Primary Panel Redesign

## Research Summary: VS Code Primary Panel Design

### Core Characteristics
1. **Header bar** with collapsible sections (Explorer, Search, Source Control, Run & Debug, Extensions)
2. **Tab-based view switching** - tabs in a horizontal strip at the top
3. **Persistent state** - expanded/collapsed sections remembered across sessions
4. **Right-click context menu** - immediate actions on items
5. **Breadcrumb navigation** - shows current selection path
6. **Compact header** - all actions in a minimal, clean top bar
7. **Drag & drop** - works seamlessly with visual feedback
8. **Empty state messaging** - helpful text when sections are empty
9. **Keyboard navigation** - arrow keys, Escape, Enter all work
10. **Tool buttons** - top-right of each section for bulk actions

---

## Current Motion Scene Panel Issues

1. **Scattered UI** - Scene, Tracks, Assets, Clips split across tabs but not visually cohesive
2. **Verbose headers** - Each collapsible takes up too much space
3. **Context menu broken** - Right-click doesn't work properly
4. **No search/filter** - Can't quickly find nodes
5. **No breadcrumb** - Hard to see deep hierarchy context
6. **Minimal keyboard support** - No quick navigation shortcuts
7. **No undo/redo hints** - User doesn't know changes are saved

---

## Proposed VS Code-Inspired Redesign

### Layout Structure

```
┌─────────────────────────────────────────────┐
│ 🎬 Scene  |  🎞️  Timeline  |  📁 Assets    │  ← Tab bar (mini icons)
├─────────────────────────────────────────────┤
│ 🔍 Search... ⚙️ | ✕ Clear | ⋮ More        │  ← Header bar w/ actions
├─────────────────────────────────────────────┤
│                                             │
│ 📁 Scene Objects                        [+] │  ← Section header w/ button
│ ├─ 🎥 Camera                               │
│ ├─ 📦 Product    ◯ 🔒                      │  ← Row: icon, name, badges, action btns
│ │  ├─ 📺 Dashboard screen                 │
│ │  └─ 📝 Title                            │
│ ├─ 💡 Ambient light                       │
│ ├─ 💡 Key light                           │
│ └─ 💡 Accent light                        │
│                                             │
│ 🎬 Tracks                               [+] │
│ ├─ 📊 Master                    👁️ 🔒      │
│ └─ 📊 Camera position           👁️ 🔒      │
│                                             │
│ 📁 Imported Media                       [+] │
│ ├─ bg_video.mp4        1.5s               │
│ └─ product_model.glb    model             │
│                                             │
│ 🎞️  Motion Clips                           │
│ ├─ Product spin         2.5s               │
│ └─ Title entrance       1.2s               │
│                                             │
└─────────────────────────────────────────────┘
```

### Key Design Elements

#### 1. Tab Bar (Top)
- **Scene** - Hierarchy + Tracks
- **Assets** - Imported media library
- **Clips** - Motion clips timeline

#### 2. Header Actions Bar
- **Search field** - Filter nodes/assets by name
- **View options** - `⋮` menu for sort, group, show all
- **Quick actions** - Add, expand all, collapse all

#### 3. Section Grouping
- **Scene Objects** section
  - Hierarchy tree with depth indentation
  - Drag-to-reparent with visual guides
  - Row badges: animated dot, missing asset icon
  - Per-row actions: duplicate, visibility, lock (visible on hover)

- **Tracks** section (on Scene tab)
  - List of animation tracks
  - Mute/lock per track
  - Drag to reorder

- **Imported Media** section (on Assets tab)
  - Filterable by type (image, video, model)
  - Inline status (on screen, missing)
  - Drag to assign to screen

- **Motion Clips** section (stays visible or on Clips tab)
  - List of reusable clips
  - Click to select on timeline
  - Drag to rearrange

#### 4. Row Design
```
[⊕] [▶] [icon] [name] [animated•] [type] [👁️ 🔒 📋]
└─┬──┘  └──┬──┘        └─────┬─────┘        └──────┬──────┘
  │        │           badges                hover-visible
  │        child toggle                      action buttons
  drag handle
```

#### 5. Context Menu
- **Right-click** → menu appears immediately
- **Options**:
  - Rename (F2)
  - Duplicate (Ctrl+D)
  - Delete (Del)
  - Separator
  - Visible / Muted / Locked (checkboxes)
  - Separator
  - Focus in Viewport

#### 6. Empty States
```
📁 Scene Objects
─────────────────
Add a scene object to begin.

[+ Add Object]  [Import Media]
```

#### 7. Keyboard Shortcuts
- **Arrow Up/Down** - Navigate tree
- **Arrow Left/Right** - Collapse/expand, change parent
- **Enter** - Rename mode
- **Escape** - Cancel rename, close context menu
- **F2** - Rename selected
- **Ctrl+D** - Duplicate selected
- **Del** - Delete selected
- **Ctrl+F** - Focus search

#### 8. Visual Hierarchy
- **Font sizes**: Headers 11px, items 12px, secondary text 10px
- **Colors**: Muted text for type, brighter for names
- **Spacing**: Compact (6-8px vertical row padding)
- **Borders**: Subtle dividers between sections
- **Hover**: Light background, action buttons appear

---

## Implementation Plan

### Phase 1: Restructure Layout
- [ ] Consolidate into single "Scene" tab (Scene Objects + Tracks)
- [ ] Keep "Assets" tab for media
- [ ] Add "Clips" tab for motion clips
- [ ] Create unified header bar above all tabs

### Phase 2: Improve Header & Search
- [ ] Add persistent search field
- [ ] Add view options menu (`⋮`)
- [ ] Add quick action buttons (+Add, ↕ Sort, ⊞ Grid)

### Phase 3: Fix Context Menu
- [ ] Ensure right-click works on all rows
- [ ] Test menu appears immediately
- [ ] Verify all actions execute

### Phase 4: Enhance Keyboard Navigation
- [ ] Full arrow key support
- [ ] Rename with F2
- [ ] Escape to cancel
- [ ] Del to delete

### Phase 5: Visual Polish
- [ ] Refined spacing & typography
- [ ] Hover states for action buttons
- [ ] Better empty state graphics
- [ ] Icons for each node type
- [ ] Badges (animated, missing) positioned well

### Phase 6: Advanced Features
- [ ] Search + filter by type
- [ ] Breadcrumb showing selection path
- [ ] Bulk actions (select multiple, delete all)
- [ ] Sort options (name, type, animated)
- [ ] Group by type option

---

## Component Hierarchy

```
MotionScenePanel
├── Tabs (Scene | Assets | Clips)
├── HeaderBar
│   ├── SearchField
│   ├── ViewOptions (⋮ menu)
│   └── QuickActions
├── SceneTab
│   ├── SceneObjectsSection
│   │   ├── SectionHeader (+Add button)
│   │   └── SceneNodeRow[] (draggable, droppable)
│   │       ├── DragHandle
│   │       ├── ExpandToggle
│   │       ├── Icon
│   │       ├── Name
│   │       ├── Badges (Animated, MissingAsset)
│   │       ├── Type (secondary)
│   │       └── ActionButtons (👁️ 🔒 📋)
│   │
│   └── TracksSection
│       ├── SectionHeader (+Add button)
│       └── TrackRow[] (like SceneNodeRow)
│
├── AssetsTab
│   ├── HeaderBar (Search by type)
│   ├── MediaSection
│   │   ├── SectionHeader
│   │   ├── MediaRow[]
│   │   └── ErrorAlert
│   │
│   └── ActionButtons (Import, Clean Unused)
│
└── ClipsTab
    ├── SectionHeader
    ├── ClipRow[]
    └── EmptyState
```

---

## Color & Typography

### Semantic Tokens
- `--card` - row background (normal)
- `--accent` - row background (selected)
- `--muted-foreground` - secondary text (type, badges)
- `--destructive` - delete button, missing asset warning
- `--primary` - animated badge, drag over indicator

### Typography
- **Header**: 11px uppercase, letter-spacing 0.8px, font-weight 600
- **Item name**: 12px, font-weight 500
- **Item type**: 9px, font-weight 400, muted
- **Secondary**: 10px, font-weight 400, muted

---

## Accessibility

- [x] All rows keyboard-accessible
- [x] ARIA labels for buttons
- [x] Focus visible rings
- [x] Color contrast ≥ 4.5:1
- [x] Semantic HTML (buttons, not divs)
- [x] Screen reader descriptions
- [x] Right-click always works (native behavior)

---

## Files to Modify

1. **MotionScenePanel.tsx** (main restructure)
2. **motion-scene-panel.test.tsx** (update tests)
3. **New: MotionScenePanelHeader.tsx** (search + actions)
4. **New: MotionSceneSection.tsx** (collapsible section with badge)
5. **New: MotionSceneRow.tsx** (individual row, extracted from current)
6. **New: hooks/use-motion-scene-search.ts** (filter logic)

---

## Migration Path

1. Backup current working state
2. Create new components in parallel
3. Run tests frequently
4. Gradual rollout: Scene tab first, then Assets
5. Full test suite pass before demo
6. Gather feedback and iterate

