/**
 * ASSET REFERENCE SYSTEM - 5-MINUTE SETUP
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Copy & paste these snippets to add asset import to any surface.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * STEP 1: Wrap app with provider (once, at root)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * In src/renderer/AppLayout.tsx or similar:
 *
 *   import { AssetReferenceProvider } from '@/contexts/AssetReferenceContext';
 *
 *   export function AppLayout() {
 *     return (
 *       <AssetReferenceProvider>
 *         {/* Your app */}
 *       </AssetReferenceProvider>
 *     );
 *   }
 *
 * ════════════════════════════════════════════════════════════════════════════
 * STEP 2: Add to your surface (e.g., Chat page)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * In your component:
 *
 *   import { useState } from 'react';
 *   import {
 *     AssetPicker,
 *     useAssetPicker,
 *     AssetReferencesPanel,
 *   } from '@/components/assets';
 *   import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';
 *
 *   export function MyPage({ sessionId, projectId }) {
 *     const assetPicker = useAssetPicker(sessionId);
 *     const { references, addReference } = useAssetReferenceContext(sessionId);
 *
 *     return (
 *       <div className="space-y-4">
 *         {/* Show what's referenced */}
 *         <AssetReferencesPanel
 *           contextId={sessionId}
 *           onAddClick={assetPicker.open}
 *         />
 *
 *         {/* Dialog for picking files */}
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
 * ════════════════════════════════════════════════════════════════════════════
 * MINIMAL EXAMPLE (Copy & paste to test)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * import { AssetReferencesPanel, useAssetPicker, AssetPicker } from '@/components/assets';
 *
 * export function TestAssets() {
 *   const picker = useAssetPicker('test-123');
 *   return (
 *     <div className="p-4">
 *       <button onClick={picker.open}>Add files</button>
 *       <AssetReferencesPanel contextId="test-123" onAddClick={picker.open} />
 *       <AssetPicker
 *         open={picker.isOpen}
 *         onOpenChange={picker.toggle}
 *         contextId="test-123"
 *         kind="all"
 *         projectId="my-project"
 *       />
 *     </div>
 *   );
 * }
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ACCESS REFERENCES IN YOUR CODE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * const { references } = useAssetReferenceContext('chat-123');
 *
 * // Each reference has:
 * references[0].fileName       // 'my-image.png'
 * references[0].fileKind       // 'image'
 * references[0].mediaUrl       // 'qeda-media://project-file/abc123'
 * references[0].path           // '/Users/.../my-image.png'
 * references[0].projectId      // 'proj-123'
 * references[0].id             // 'aref-1234567-abc123def'
 *
 * // Send to your agent:
 * const payload = {
 *   message: userInput,
 *   attachments: references,
 * };
 *
 * ════════════════════════════════════════════════════════════════════════════
 * KINDS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * kind="media"     → images, video, audio (for embedding)
 * kind="document"  → PDF, Word, text files (for reading)
 * kind="code"      → source code files (for analysis)
 * kind="all"       → everything (default)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * WITH PERSISTENCE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * import { usePersistentAssets } from '@/hooks/use-persistent-assets';
 *
 * export function ChatWithPersistence({ sessionId }) {
 *   const { references } = usePersistentAssets(
 *     sessionId,
 *     `chat:${sessionId}:assets`  // Automatically saves/restores
 *   );
 *   // ...
 * }
 *
 * ════════════════════════════════════════════════════════════════════════════
 */
