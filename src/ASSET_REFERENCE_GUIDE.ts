/**
 * ASSET REFERENCE SYSTEM - QUICK START GUIDE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * The asset reference system enables any surface (Chat, Documents, Tasks, etc.)
 * to import and reference project files without prop drilling or tight coupling.
 *
 * FILES CREATED:
 * ──────────────
 *
 * 1. HOOKS
 *    - src/hooks/use-asset-reference.ts
 *      Local per-context reference tracking. Use when you only need refs
 *      within one component tree.
 *
 *    - src/hooks/use-persistent-assets.ts
 *      Auto-save refs to localStorage/IndexedDB. Use for sessions that
 *      need to persist across page reloads.
 *
 * 2. CONTEXT
 *    - src/contexts/AssetReferenceContext.tsx
 *      Global state for references. Wrap your app (or feature) with
 *      <AssetReferenceProvider> to enable useAssetReferenceContext.
 *
 * 3. COMPONENTS
 *    - src/components/assets/AssetPicker.tsx
 *      Dialog for picking files. Integrates with ProjectFileBrowserDialog.
 *
 *    - src/components/assets/AssetReferencesPanel.tsx
 *      Display list of references with actions (reveal, open, remove).
 *
 *    - src/components/assets/index.ts
 *      Barrel export.
 *
 * 4. BACKEND
 *    - src/main/ipc/handlers/asset-references.ts
 *      IPC handlers for save/load/export/import operations.
 *
 *    - src/main/ipc/index.ts (modified)
 *      Registered the asset reference handlers.
 *
 *    - src/main/ipc/channels.ts (modified)
 *      Added 6 new channels for asset operations.
 *
 * 5. EXAMPLES
 *    - src/examples/AssetReferenceIntegration.tsx
 *      Complete usage examples for Chat, Documents, Tasks, Research.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * INTEGRATION STEPS
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Step 1: Wrap your app with the provider
 * ───────────────────────────────────────
 *
 *   // In your root layout/shell component
 *   import { AssetReferenceProvider } from '@/contexts/AssetReferenceContext';
 *
 *   export function AppShell() {
 *     return (
 *       <AssetReferenceProvider>
 *         {/* Your router and pages */}
 *       </AssetReferenceProvider>
 *     );
 *   }
 *
 * Step 2: Use in a surface (e.g., Chat)
 * ────────────────────────────────────
 *
 *   import { AssetPicker, useAssetPicker } from '@/components/assets';
 *   import { AssetReferencesPanel } from '@/components/assets';
 *   import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';
 *
 *   export function ChatPage({ sessionId, projectId }) {
 *     const assetPicker = useAssetPicker(sessionId);
 *     const { references, addReference } = useAssetReferenceContext(sessionId);
 *
 *     return (
 *       <div>
 *         <AssetReferencesPanel
 *           contextId={sessionId}
 *           onAddClick={assetPicker.open}
 *         />
 *
 *         <AssetPicker
 *           open={assetPicker.isOpen}
 *           onOpenChange={assetPicker.toggle}
 *           contextId={sessionId}
 *           kind="all"
 *           projectId={projectId}
 *         />
 *       </div>
 *     );
 *   }
 *
 * Step 3: Send references to your agent/handler
 * ──────────────────────────────────────────────
 *
 *   When the user sends a message, include the references:
 *
 *     const messageWithContext = {
 *       text: userInput,
 *       attachments: references.map(ref => ({
 *         type: ref.fileKind,
 *         path: ref.path,
 *         mediaUrl: ref.mediaUrl,
 *       })),
 *     };
 *
 *     // Send to agent or IPC
 *
 * Step 4: Optionally persist across sessions
 * ──────────────────────────────────────────
 *
 *   import { usePersistentAssets } from '@/hooks/use-persistent-assets';
 *
 *   export function ChatPage({ sessionId, projectId }) {
 *     const { references } = usePersistentAssets(
 *       sessionId,
 *       `chat:${sessionId}:assets`  // localStorage key
 *     );
 *
 *     // References auto-load and auto-save
 *   }
 *
 * ──────────────────────────────────────────────────────────────────────────
 * API REFERENCE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * useAssetReference(contextId)
 * ───────────────────────────
 * Local hook for per-context tracking.
 *
 *   Returns:
 *     - references: AssetReference[]
 *     - addReference(selections: ProjectFileSelection | ProjectFileSelection[])
 *     - removeReference(refId: string)
 *     - clearReferences()
 *     - hasReference(projectId, filePath): boolean
 *     - exportReferences(): JSON
 *     - importReferences(data: JSON)
 *     - error: string | null
 *     - count: number
 *
 * useAssetReferenceContext(contextId)
 * ────────────────────────────────────
 * Global hook for shared state (requires provider).
 *
 *   Returns:
 *     - references: AssetReference[]
 *     - addReference(selections)
 *     - removeReference(refId)
 *     - clearReferences()
 *     - hasReference(projectId, filePath)
 *
 * usePersistentAssets(contextId, storageKey, options?)
 * ─────────────────────────────────────────────────────
 * Auto-loading/saving to localStorage.
 *
 *   Options:
 *     - storage?: Storage (default: localStorage)
 *     - saveDebounceMs?: number (default: 1000)
 *
 * useAssetPicker(contextId)
 * ────────────────────────
 * Helper for toggle/open/close picker state.
 *
 *   Returns:
 *     - isOpen: boolean
 *     - open(): void
 *     - close(): void
 *     - toggle(): void
 *
 * <AssetPicker />
 * ────────────────
 * Dialog component.
 *
 *   Props:
 *     - open: boolean
 *     - onOpenChange: (open: boolean) => void
 *     - contextId: string
 *     - kind?: 'media' | 'document' | 'code' | 'all'
 *     - projectId?: string
 *     - multiple?: boolean (default: true)
 *     - onSelect?: (files: ProjectFileSelection[]) => void
 *     - title?: string
 *
 * <AssetReferencesPanel />
 * ────────────────────────
 * List display component.
 *
 *   Props:
 *     - contextId: string
 *     - onAddClick?: () => void
 *     - showEmpty?: boolean (default: true)
 *     - compact?: boolean (default: false)
 *
 * ──────────────────────────────────────────────────────────────────────────
 * IPC CHANNELS
 * ──────────────────────────────────────────────────────────────────────────
 *
 * asset-references:save
 *   Persist references for a context.
 *
 * asset-references:load
 *   Restore references from storage.
 *
 * asset-references:resolve-metadata
 *   Get enriched metadata for files (exists, preview, etc.).
 *
 * asset-references:export-context
 *   Create a snapshot for export/sharing.
 *
 * asset-references:import-context
 *   Restore a snapshot.
 *
 * asset-references:clear-context
 *   Delete all references for a context.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ASSET REFERENCE TYPE
 * ──────────────────────────────────────────────────────────────────────────
 *
 * interface AssetReference {
 *   id: string;                              // Unique ref ID
 *   contextId: string;                       // Which context owns this
 *   projectId: string;                       // Which project it came from
 *   fileName: string;                        // Display name
 *   fileKind: string;                        // 'image' | 'video' | 'document' | etc.
 *   mediaUrl: string | null;                 // qeda-media://... or null
 *   path: string;                            // Absolute filesystem path
 *   importedAt: number;                      // Timestamp
 *   metadata?: Record<string, unknown>;      // Custom per-surface data
 * }
 *
 * ──────────────────────────────────────────────────────────────────────────
 * BEST PRACTICES
 * ──────────────────────────────────────────────────────────────────────────
 *
 * 1. Use unique context IDs
 *    ✓ 'chat-abc123', 'doc-xyz789', 'task-def456'
 *    ✗ 'assets', 'files', 'refs' (too generic, can collide)
 *
 * 2. Scope to surface, not component
 *    Use the same contextId for all sub-components of a surface
 *    so they share the reference list.
 *
 * 3. Provide project scope
 *    Pass projectId to AssetPicker so users don't have to re-select
 *    the project every time.
 *
 * 4. Display before sending
 *    Show AssetReferencesPanel so users can confirm what will be sent.
 *
 * 5. Handle removal
 *    Let users remove references from the panel without sending the whole
 *    list every time.
 *
 * 6. Persist important contexts
 *    For chat/docs/tasks: use usePersistentAssets to survive reloads.
 *    For transient contexts: skip persistence.
 *
 * ──────────────────────────────────────────────────────────────────────────
 */

export interface AssetReferenceQuickStart {
  docs: string;
}
