/**
 * examples/AssetReferenceIntegration.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * INTEGRATION GUIDE: How to add asset references to any surface.
 *
 * The asset reference system is built in three layers:
 *
 * 1. PROVIDER (wrap your app)
 *    ──────────────────────
 *    Add at the app root or within a feature:
 *
 *      import { AssetReferenceProvider } from '@/contexts/AssetReferenceContext';
 *
 *      export function App() {
 *        return (
 *          <AssetReferenceProvider>
 *            <YourApp />
 *          </AssetReferenceProvider>
 *        );
 *      }
 *
 * 2. LOCAL HOOK (within a component)
 *    ──────────────────────────────
 *    For simple use cases where you just need per-context reference tracking:
 *
 *      import { useAssetReference } from '@/hooks/use-asset-reference';
 *
 *      export function MyComponent() {
 *        const refs = useAssetReference('my-context-123');
 *        // refs.references: AssetReference[]
 *        // refs.addReference(selection)
 *        // refs.removeReference(refId)
 *        // refs.exportReferences() - for persistence
 *      }
 *
 * 3. GLOBAL CONTEXT (when multiple surfaces share refs)
 *    ────────────────────────────────────────────────
 *    When you need multiple surfaces to reference the same assets:
 *
 *      import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';
 *
 *      export function MyComponent({ contextId }) {
 *        const { references, addReference, removeReference } =
 *          useAssetReferenceContext(contextId);
 *      }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXAMPLE 1: Chat surface with asset references
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AssetPicker, useAssetPicker, AssetReferencesPanel } from '@/components/assets';
import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';

export function ChatWithAssets({ sessionId, projectId }: { sessionId: string; projectId: string }) {
  const assetPicker = useAssetPicker(sessionId);
  const { references, addReference } = useAssetReferenceContext(sessionId);

  return (
    <div className="space-y-4">
      {/* Display referenced assets */}
      <AssetReferencesPanel
        contextId={sessionId}
        onAddClick={assetPicker.open}
        compact={false}
      />

      {/* Add more button */}
      <Button onClick={assetPicker.open} variant="outline" size="sm">
        + Add context
      </Button>

      {/* Asset picker dialog */}
      <AssetPicker
        open={assetPicker.isOpen}
        onOpenChange={assetPicker.toggle}
        contextId={sessionId}
        kind="all"
        projectId={projectId}
        onSelect={(files) => {
          // This is called after files are added to context
          console.log('Selected files:', files);
        }}
      />
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXAMPLE 2: Document editor with media attachments
 * ─────────────────────────────────────────────────────────────────────────────
 * In a document editor, you might want to attach images/media and embed them.
 */

export function DocumentEditorWithMedia({ documentId, projectId }: { documentId: string; projectId: string }) {
  const [content, setContent] = useState('');
  const assetPicker = useAssetPicker(`doc-${documentId}`);
  const { references } = useAssetReferenceContext(`doc-${documentId}`);

  const insertMediaReference = () => {
    const mediaRefs = references
      .filter((r) => r.fileKind === 'image' || r.fileKind === 'video')
      .map((r) => `![${r.fileName}](${r.mediaUrl})`)
      .join('\n');

    setContent((prev) => prev + '\n' + mediaRefs);
  };

  return (
    <div className="space-y-4">
      <textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-64 w-full" />

      <div className="flex gap-2">
        <Button onClick={assetPicker.open} variant="outline" size="sm">
          Add media
        </Button>
        <Button onClick={insertMediaReference} variant="outline" size="sm">
          Insert references
        </Button>
      </div>

      <AssetReferencesPanel contextId={`doc-${documentId}`} showEmpty={false} compact />

      <AssetPicker
        open={assetPicker.isOpen}
        onOpenChange={assetPicker.toggle}
        contextId={`doc-${documentId}`}
        kind="media"
        projectId={projectId}
      />
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXAMPLE 3: Task with attached files
 * ─────────────────────────────────────────────────────────────────────────────
 * A task might want to reference related files or code that should be considered.
 */

export function TaskWithAttachments({ taskId, projectId }: { taskId: string; projectId: string }) {
  const assetPicker = useAssetPicker(`task-${taskId}`);
  const { references } = useAssetReferenceContext(`task-${taskId}`);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3">
        <h4 className="font-semibold">Task Details</h4>
        <p className="text-sm text-muted-foreground">Task description here</p>
      </div>

      <div>
        <h5 className="mb-2 text-sm font-medium">Related Files</h5>
        <AssetReferencesPanel
          contextId={`task-${taskId}`}
          onAddClick={assetPicker.open}
          compact
        />
      </div>

      <AssetPicker
        open={assetPicker.isOpen}
        onOpenChange={assetPicker.toggle}
        contextId={`task-${taskId}`}
        kind="code"
        projectId={projectId}
      />
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * EXAMPLE 4: Research context with sources
 * ─────────────────────────────────────────────────────────────────────────────
 * A research session that collects and references relevant documents/snippets.
 */

export function ResearchWithSources({ researchId, projectId }: { researchId: string; projectId: string }) {
  const assetPicker = useAssetPicker(`research-${researchId}`);
  const { references, exportReferences } = useAssetReferenceContext(`research-${researchId}`);

  const exportSources = () => {
    const sources = exportReferences();
    console.log('Research sources:', JSON.stringify(sources, null, 2));
    // Save to database or file
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3">
        <h4 className="font-semibold">Research Question</h4>
        <p className="text-sm">Your research topic here</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h5 className="font-medium">Sources ({references.length})</h5>
          <Button onClick={assetPicker.open} size="sm" variant="ghost">
            + Add
          </Button>
        </div>
        <AssetReferencesPanel
          contextId={`research-${researchId}`}
          showEmpty={false}
          compact
        />
      </div>

      <Button onClick={exportSources} className="w-full" size="sm">
        Export Sources
      </Button>

      <AssetPicker
        open={assetPicker.isOpen}
        onOpenChange={assetPicker.toggle}
        contextId={`research-${researchId}`}
        kind="document"
        projectId={projectId}
        multiple
      />
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * KEY CONCEPTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Context ID: A unique string that identifies a "reference container".
 *   - "chat-abc123"
 *   - "doc-xyz789"
 *   - "task-def456"
 *
 *   Use a unique ID per surface instance so references don't leak between
 *   separate sessions/documents/tasks.
 *
 * Asset Picker Kinds:
 *   - 'media'    → images, video, audio
 *   - 'document' → PDFs, Word docs, text files
 *   - 'code'     → source code files
 *   - 'all'      → everything
 *
 * Persistence:
 *   For chat: store exportReferences() in session context_json
 *   For docs: store in document.assets_json
 *   For tasks: store in task.attachments_json
 *
 *   On load: useAssetReference(contextId).importReferences(saved)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
