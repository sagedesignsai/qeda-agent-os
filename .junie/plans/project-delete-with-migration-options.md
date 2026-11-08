---
sessionId: session-261108-025704-1xvm
---

# Requirements

### Overview
Enhance the project delete flow so users can control what happens to each category of associated data — migrate to Inbox, migrate to another project, or permanently delete — rather than the current silent re-homing behavior.

### Current Behavior
- `deleteProject()` re-homes tasks, documents, and studio takes to Inbox
- Detaches task blocks, chat sessions, and terminal sessions (sets `project_id = NULL`)
- The UI shows a simple AlertDialog with only confirm/cancel
- No visibility into what will happen to associated data

### Goals
- Give users full visibility into what data is attached to a project before deleting
- Allow per-category control: migrate to Inbox, migrate to another project, or delete
- Only show categories that actually have data (non-zero counts)
- Preserve the existing safe defaults (migrate to Inbox for user-authored work)

### User Story
As a project owner, I want to see what data is attached to my project when I delete it, so I can choose whether to move my work to another project or the Inbox, or permanently discard it.

### Functional Requirements

**Delete Dialog (new `ProjectDeleteDialog`)**
- Triggered when the user clicks "Delete" on a project card or detail page
- Shows the project name and a warning that the project itself will be deleted
- Fetches `ProjectLinkedCounts` to determine which categories have data
- Displays only categories with non-zero counts in accordion sections
- Each category section contains:
  - The count of items (e.g., "3 tasks")
  - Radio-style options:
    - "Move to Inbox" (default for tasks, documents, studio takes)
    - "Move to [project dropdown]" (shows other non-archived projects)
    - "Delete permanently" (destructive, red text)
  - A brief description of what the category contains
- Categories and their default actions:
  - **Tasks** → Move to Inbox (default)
  - **Documents** → Move to Inbox (default)
  - **Studio Takes** → Move to Inbox (default)
  - **Terminal Sessions** → Detach (default, no migration — ephemeral)
  - **Chat Sessions** → Detach (default, no migration — ephemeral)
  - **Research Runs** → Detach (default)
  - **Sound Lab Sessions** → Detach (default)
  - **Code Projects** → Detach (default)
  - **Knowledge Pages** → Detach (default)
  - **Focus Sessions** → Detach (default, tied to tasks, not projects directly)
- "Delete project" button (destructive) at the bottom
- "Cancel" button

### Out of Scope
- Bulk delete multiple projects
- Undo after delete
- Export project data before delete

# Technical Design

### Current Implementation

**Database** (`src/main/db/projects.ts`, lines 589-618)
- `deleteProject(id)` runs a transaction that:
  - Updates `tasks.project_id` → Inbox
  - Updates `documents.project_id` → Inbox
  - Updates `studio_takes.project_id` → Inbox
  - Sets `task_blocks.project_id` → NULL
  - Sets `sessions.project_id` → NULL
  - Sets `terminal_sessions.project_id` → NULL
  - Deletes the project row

**IPC** (`src/main/ipc/channels.ts`, line 1099-1100)
- `projects:delete` takes `{ id: string }`, returns `boolean`

**IPC Handler** (`src/main/ipc/handlers/projects.ts`, lines 89-105)
- Calls `deleteProject(id)`, clears active project if needed, broadcasts `projects:changed`

**UI** (`src/renderer/pages/Projects.tsx`)
- `DeleteDialog` (lines 700-734): simple AlertDialog, confirms with `handleDelete()`
- `handleDelete()` (lines 203-216): calls `deleteProject(id)` from `useProjects()` hook

**Linked Counts** (`ProjectLinkedCounts` in `src/main/db/projects.ts`, lines 89-106)
- Already computed by `projectOverview()` and available via `projects:overview` IPC

### Key Decisions

1. **New database function `deleteProjectWithOptions()`** — instead of modifying `deleteProject()`, add a new function that accepts a `DeleteOptions` map. The existing `deleteProject()` delegates to it with default options, preserving backward compatibility.

2. **New IPC channel `projects:delete-with-options`** — extends the delete API to accept per-category disposal instructions. The existing `projects:delete` remains unchanged for backward compat.

3. **Dialog fetches overview data** — the delete dialog uses `projects:overview` IPC to get `ProjectLinkedCounts` and the list of other projects for the target dropdown.

4. **Accordion only for categories with data** — categories with 0 items are hidden entirely to keep the dialog compact.

5. **Detach as the default for ephemeral data** — terminal sessions, chat sessions, focus sessions, research runs, sound lab sessions, code projects, and knowledge pages default to "Detach" (set `project_id = NULL`) since they are not user-authored content that needs preservation.

### Proposed Changes

#### 1. Database Layer (`src/main/db/projects.ts`)

**New types:**
```typescript
type DisposalAction = 'inbox' | 'detach' | 'delete' | { migrate: string }; // migrate = target project id

interface DeleteOptions {
  tasks?: DisposalAction;
  documents?: DisposalAction;
  studioTakes?: DisposalAction;
  terminalSessions?: DisposalAction;
  chatSessions?: DisposalAction;
  researchRuns?: DisposalAction;
  soundLabSessions?: DisposalAction;
  codeProjects?: DisposalAction;
  knowledgePages?: DisposalAction;
}
```

**New function `deleteProjectWithOptions(id, opts)`**:
- Accepts per-category disposal actions
- For each category, executes the appropriate SQL:
  - `inbox`: `UPDATE <table> SET project_id = 'inbox' WHERE project_id = ?`
  - `migrate`: `UPDATE <table> SET project_id = ? WHERE project_id = ?`
  - `detach`: `UPDATE <table> SET project_id = NULL WHERE project_id = ?`
  - `delete`: `DELETE FROM <table> WHERE project_id = ?`
- Wraps everything in a transaction
- Deletes the project row at the end

**Updated `deleteProject(id)`**: delegates to `deleteProjectWithOptions()` with defaults.

#### 2. IPC Layer

**`src/main/ipc/channels.ts`**: Add new channel:
```typescript
'projects:delete-with-options': {
  req: { id: string; options: DeleteOptions };
  res: boolean;
};
```

**`src/main/ipc/handlers/projects.ts`**: Add handler for `projects:delete-with-options`.

#### 3. Hook Layer (`src/hooks/use-projects.ts`)

Add `deleteProjectWithOptions(id, options)` method to `UseProjectsReturn`.

#### 4. UI Layer

**New component `ProjectDeleteDialog`** (`src/components/projects/ProjectDeleteDialog.tsx`):
- Replaces the inline `DeleteDialog` in `Projects.tsx`
- Uses `AlertDialog` as the outer shell
- Fetches `projects:overview` to get linked counts
- Fetches `projects:rollups` to populate the target project dropdown
- Renders accordion sections per category with data
- Each section has radio buttons + project dropdown
- Submits to `deleteProjectWithOptions()`

**Updated `Projects.tsx`**:
- Replaces `DeleteDialog` with `ProjectDeleteDialog`
- Updates `handleDelete` to pass options

### File Structure

| File | Action |
|------|--------|
| `src/main/db/projects.ts` | Modified: new types, `deleteProjectWithOptions()` |
| `src/main/ipc/channels.ts` | Modified: new IPC channel |
| `src/main/ipc/handlers/projects.ts` | Modified: new handler |
| `src/hooks/use-projects.ts` | Modified: new hook method |
| `src/components/projects/ProjectDeleteDialog.tsx` | **Created**: new delete dialog |
| `src/renderer/pages/Projects.tsx` | Modified: use new dialog |

### Architecture Diagram

``` mermaid
graph LR
  A[Projects.tsx] -->|opens| B[ProjectDeleteDialog]
  B -->|IPC: projects:overview| C[Main Process]
  B -->|IPC: projects:rollups| C
  B -->|IPC: projects:delete-with-options| C
  C -->|deleteProjectWithOptions| D[DB: projects.ts]
  D -->|transaction| E[SQLite]
  C -->|broadcast projects:changed| A
```

### Risks
- **Data loss**: The "Delete permanently" option is irreversible. Mitigated by making it the least prominent option (red text, not the default).
- **Transaction safety**: All operations must be atomic. The existing `deleteProject()` uses `db.transaction()` — the new function will too.
- **Inbox deletion guard**: The Inbox (`id: 'inbox'`) cannot be deleted. The new function inherits this guard.
- **Target project validation**: The selected target project must exist and not be the project being deleted. Validated in the IPC handler.

# Delivery Steps

### ✓ Step 1: Add database layer for delete with options
Add `deleteProjectWithOptions()` to `src/main/db/projects.ts` with per-category disposal logic.
- Define `DisposalAction` type and `DeleteOptions` interface
- Implement `deleteProjectWithOptions(id, opts)` that processes each category with the appropriate SQL (UPDATE to inbox/migrate/NULL, or DELETE)
- Wrap all operations in a database transaction
- Update existing `deleteProject(id)` to delegate to `deleteProjectWithOptions()` with default options (tasks, documents, studio takes → inbox; everything else → detach)
- Export the new types for IPC consumption

### ✓ Step 2: Add IPC channel and handler for delete with options
Wire the new database function through the IPC layer.
- Add `projects:delete-with-options` channel to `src/main/ipc/channels.ts` with request/response types
- Add handler in `src/main/ipc/handlers/projects.ts` that validates the target project IDs, calls `deleteProjectWithOptions()`, clears active project if needed, and broadcasts `projects:changed`
- Validate that migration targets are not the project being deleted and are not archived

### ✓ Step 3: Update the useProjects hook
Add `deleteProjectWithOptions` method to the `useProjects` hook in `src/hooks/use-projects.ts`.
- Add `DeleteOptions` to the hook's return type
- Implement `deleteProjectWithOptions(id, options)` that invokes the new IPC channel and refreshes the project list
- Export the `DeleteOptions` type from the hook for UI consumption

### ✓ Step 4: Create ProjectDeleteDialog component
Build the new delete dialog in `src/components/projects/ProjectDeleteDialog.tsx`.
- Use `AlertDialog` as the outer shell with proper `DialogTitle` and `DialogDescription`
- Fetch `projects:overview` to get `ProjectLinkedCounts` for the target project
- Fetch `projects:rollups` to populate the target project dropdown (excluding the project being deleted and archived projects)
- Render accordion sections only for categories with non-zero counts using `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`
- Each section shows: count badge, category name, radio-style options (Move to Inbox / Move to [dropdown] / Delete permanently)
- Default actions: tasks, documents, studio takes → Inbox; ephemeral data → Detach
- Submit button calls `deleteProjectWithOptions` with the collected options
- Include a warning banner for any category set to "Delete permanently"

### ✓ Step 5: Integrate dialog into Projects page
Replace the existing `DeleteDialog` in `src/renderer/pages/Projects.tsx` with `ProjectDeleteDialog`.
- Remove the inline `DeleteDialog` component (lines 700-734)
- Update `handleDelete` to no longer be needed (the dialog handles its own submission)
- Wire `ProjectDeleteDialog` to the `pendingDelete` state
- Update both instances of `DeleteDialog` (detail view and list view) to use the new component
- Remove the toast description about tasks moving to Inbox since the dialog now shows what will happen