/**
 * COPILOT + ASSETS INTEGRATION GUIDE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * How to add asset references to every copilot chat surface in Qeda.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * QUICK INTEGRATION (for any existing copilot)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Step 1: Update your copilot chat component (e.g., CopilotPanel, StudioCopilotSheet)
 *
 *   import { useMessageAssets } from '@/hooks/use-message-assets';
 *   import { AssetInput } from '@/components/assets';
 *
 *   export function MyCopiloPanel({ open, projectId, ...props }) {
 *     const { sendMessage } = useCopilotChat();
 *
 *     // NEW: Asset management
 *     const assets = useMessageAssets(`copilot-${Math.random()}`, {
 *       autoClearOnSend: true,
 *     });
 *
 *     const handleSendMessage = useCallback(
 *       async (text) => {
 *         await assets.sendWithAssets(text, (msgText, attachments) => {
 *           sendMessage(msgText, attachments);
 *         });
 *       },
 *       [assets, sendMessage]
 *     );
 *
 *     return (
 *       <Sheet open={open} onOpenChange={onOpenChange}>
 *         <SheetContent>
 *           {/* ... existing message list ... */}
 *
 *           {/* NEW: Chat input with asset picker */}
 *           <PromptInput onSubmit={(msg) => handleSendMessage(msg.text)}>
 *             <PromptInputBody>
 *               <PromptInputTextarea />
 *             </PromptInputBody>
 *             <PromptInputFooter>
 *               <PromptInputTools>
 *                 {/* NEW: Asset picker button */}
 *                 <AssetInput
 *                   contextId={`copilot-${props.contextId}`}
 *                   projectId={projectId}
 *                 />
 *               </PromptInputTools>
 *               <PromptInputSubmit />
 *             </PromptInputFooter>
 *           </PromptInput>
 *         </SheetContent>
 *       </Sheet>
 *     );
 *   }
 *
 * Step 2: Update your copilot agent to handle attachments
 *
 *   See: AGENT_ATTACHMENT_HANDLING.ts (below)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * COPILOT AGENTS THAT NEED UPDATES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * These copilot agents should be updated to support assets:
 *
 * 1. Task Copilot (Focus) - src/components/copilot/CopilotPanel.tsx
 *    └─ Can reference task files, code, context
 *
 * 2. Studio Copilot - src/components/studio/copilot/StudioCopilotSheet.tsx
 *    └─ Can reference recordings, media files
 *
 * 3. Trace Copilot - src/components/trace/copilot/TraceCopilotSheet.tsx
 *    └─ Can reference SVG files, templates
 *
 * 4. Motion Copilot - (similar pattern)
 *    └─ Can reference 3D models, scenes
 *
 * 5. Music Copilot - (similar pattern)
 *    └─ Can reference audio files, tracks
 *
 * 6. Correspondence Copilot - (similar pattern)
 *    └─ Can reference attachments, references
 *
 * 7. Document Drafter - (similar pattern)
 *    └─ Can reference documents, images
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FILE STRUCTURE (what was added)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * NEW FILES:
 *   src/components/assets/AssetInput.tsx
 *     - Button for ChatInput footer
 *     - Shows badge with asset count
 *     - Integrates with AssetPicker
 *     - Works in all copilots
 *
 *   src/lib/asset-attachments-adapter.ts
 *     - Convert AssetReference ↔ AI SDK FileUIPart
 *     - Create sendable attachment payloads
 *     - Format for system prompts
 *
 *   src/hooks/use-message-assets.ts
 *     - Orchestrate asset references for messages
 *     - Handle send + auto-clear
 *     - Create message payloads
 *
 *   src/examples/CopilotChatWithAssets.tsx
 *     - Complete working example
 *     - Integration patterns
 *     - Agent usage notes
 *
 * MODIFIED FILES:
 *   src/components/assets/index.ts
 *     - Added AssetInput export
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * API USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * AssetInput Component:
 * ───────────────────
 *   <AssetInput
 *     contextId="copilot-task"           // Unique scope
 *     projectId={activeProjectId}        // Project picker scope
 *     onAssetsChange={(refs) => {...}}   // Called when assets change
 *     alwaysVisible={true}               // Show even without assets
 *   />
 *
 * useMessageAssets Hook:
 * ──────────────────────
 *   const assets = useMessageAssets('copilot-task', {
 *     autoClearOnSend: true,             // Clear after send
 *     debug: false                       // Log operations
 *   });
 *
 *   // Current state
 *   assets.references                  // AssetReference[]
 *   assets.count                       // number
 *   assets.summary                     // string ("2 images, 1 doc")
 *   assets.hasPending                  // boolean
 *
 *   // Send message with assets
 *   await assets.sendWithAssets(text, (msgText, attachments) => {
 *     sendMessage(msgText, attachments);
 *   });
 *
 *   // Manual operations
 *   assets.clear()                     // Clear all
 *
 * Adapter Functions:
 * ──────────────────
 *   assetRefToFileUIPart(ref)          // Single asset → FileUIPart
 *   assetRefsToFileUIParts(refs)       // Multiple → FileUIParts[]
 *   assetRefsToAttachments(refs)       // → SendableAttachment[]
 *   createMessageWithAttachments(text, refs) // → { text, attachments }
 *   formatAttachmentsForSystem(refs)   // → string for system prompt
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * AGENT SIDE: Handling Attachments
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * When your copilot agent receives a message with attachments:
 *
 * interface MessageWithAttachments {
 *   text: string;
 *   attachments?: Array<{
 *     id: string;
 *     fileName: string;
 *     fileKind: string;
 *     path: string;
 *     projectId: string;
 *     mediaUrl?: string;
 *   }>;
 * }
 *
 * In your IPC handler:
 *
 *   ipcMain.handle('my-copilot:chat', async (_event, { text, attachments }) => {
 *
 *     // Option 1: Add context to system prompt
 *     let systemPrompt = baseSystemPrompt;
 *     if (attachments?.length > 0) {
 *       const files = attachments
 *         .map(a => `- ${a.fileName} (${a.fileKind})`)
 *         .join('\n');
 *       systemPrompt += `\n\nUser has provided:\n${files}`;
 *     }
 *
 *     // Option 2: Index for RAG
 *     if (attachments?.length > 0) {
 *       for (const att of attachments) {
 *         try {
 *           await indexFile(att.projectId, att.id);
 *         } catch (err) {
 *           console.error(`Failed to index ${att.fileName}:`, err);
 *         }
 *       }
 *     }
 *
 *     // Option 3: Pass to specific tool
 *     const tools = {
 *       analyze_file: {
 *         description: 'Analyze a provided file',
 *         parameters: z.object({
 *           fileId: z.string().describe('ID of file from attachments'),
 *         }),
 *         execute: async ({ fileId }) => {
 *           // Find attachment by ID
 *           const att = attachments?.find(a => a.id === fileId);
 *           if (!att) throw new Error('File not found');
 *
 *           // Read content
 *           const content = await window.electron.ipc.invoke('project-files:read-text', {
 *             projectId: att.projectId,
 *             fileId: att.id,
 *           });
 *           return content;
 *         },
 *       },
 *     };
 *
 *     // ... continue with agent
 *   });
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PERSISTENCE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Assets auto-clear after sending by default. To persist them:
 *
 * 1. Store in message payload:
 *
 *    const message = {
 *      id: generateId(),
 *      role: 'user',
 *      content: text,
 *      attachments: assets.references.map(r => ({
 *        id: r.id,
 *        fileName: r.fileName,
 *        fileKind: r.fileKind,
 *        // ... other properties
 *      })),
 *    };
 *
 * 2. Restore on load:
 *
 *    if (message.attachments?.length > 0) {
 *      assets.references // Already restored by context
 *    }
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * EXAMPLE: Updating TaskCopilotPanel
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Current:
 *   export function CopilotPanel({ ... }) {
 *     const { sendMessage } = useCopilotChat();
 *     return (
 *       <PromptInput onSubmit={...}>
 *         <PromptInputTextarea />
 *         <PromptInputFooter>
 *           <PromptInputSubmit />
 *         </PromptInputFooter>
 *       </PromptInput>
 *     );
 *   }
 *
 * Updated:
 *   export function CopilotPanel({ projectId, ... }) {
 *     const { sendMessage } = useCopilotChat();
 *     const assets = useMessageAssets(`copilot-task-${projectId}`);
 *
 *     const handleSend = async (msg) => {
 *       await assets.sendWithAssets(msg.text, (text, attachments) => {
 *         sendMessage(text, attachments);
 *       });
 *     };
 *
 *     return (
 *       <PromptInput onSubmit={handleSend}>
 *         <PromptInputTextarea />
 *         <PromptInputFooter>
 *           <PromptInputTools>
 *             <AssetInput
 *               contextId={`copilot-task-${projectId}`}
 *               projectId={projectId}
 *             />
 *           </PromptInputTools>
 *           <PromptInputSubmit />
 *         </PromptInputFooter>
 *       </PromptInput>
 *     );
 *   }
 *
 * That's it! The rest is automatic.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
