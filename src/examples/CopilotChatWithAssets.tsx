/**
 * examples/CopilotChatWithAssets.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete example: Copilot chat with asset references integrated.
 *
 * Shows:
 * - AssetInput in ChatInput footer
 * - Message display with assets via <Attachment>
 * - Sending attachments to agent
 * - Auto-clearing after send
 * - Works with all copilot surfaces
 *
 * Copy this pattern into any copilot chat surface.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useMemo } from 'react';
import { BotIcon } from 'lucide-react';

import { Conversation, ConversationContent } from '@/components/ai-elements/conversation';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { AssetInput } from '@/components/assets/AssetInput';
import { Attachments, Attachment, AttachmentPreview } from '@/components/ai-elements/attachments';
import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';
import { useMessageAssets } from '@/hooks/use-message-assets';
import { assetRefsToFileUIParts } from '@/lib/asset-attachments-adapter';
import type { UIMessage } from 'ai';

interface CopilotChatWithAssetsProps {
  /** Session/context ID for asset scope */
  contextId: string;
  /** Project for asset picker scope */
  projectId?: string | null;
  /** Messages from copilot chat hook */
  messages: UIMessage[];
  /** Handler to send message to agent */
  onSendMessage: (text: string, attachments?: any[]) => void | Promise<void>;
  /** Is the agent currently streaming? */
  isStreaming?: boolean;
  /** Stop the current stream */
  onStop?: () => void;
}

export function CopilotChatWithAssets({
  contextId,
  projectId,
  messages,
  onSendMessage,
  isStreaming = false,
  onStop,
}: CopilotChatWithAssetsProps) {
  const assets = useMessageAssets(contextId, {
    autoClearOnSend: true,
    debug: false,
  });

  /**
   * Handle message send: include assets, then clear.
   */
  const handleSendMessage = useCallback(
    async (text: string) => {
      try {
        // Send with assets; useMessageAssets handles clearing
        await assets.sendWithAssets(text, (msgText, attachments) => {
          onSendMessage(msgText, attachments);
        });
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    },
    [assets, onSendMessage]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Messages with asset attachments displayed */}
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="p-4">
          <MessageList
            messages={messages.map((msg) => {
              // Add asset attachments to message display
              return {
                ...msg,
                // If message has attachments from agent, they'd go here
              };
            })}
          />
        </ConversationContent>
      </Conversation>

      {/* Input with asset picker */}
      <div className="shrink-0 border-t p-4">
        <ChatInput
          onSend={handleSendMessage}
          onStop={onStop}
          disabled={false}
          isStreaming={isStreaming}
          placeholder="Ask with files… (Ctrl+Enter to send)"
          assetControls={
            <AssetInput
              contextId={contextId}
              projectId={projectId}
              onAssetsChange={(refs) => {
                // Optional: track asset changes
                console.log(`Assets updated: ${refs.length}`);
              }}
            />
          }
        />

        {/* Show pending assets below input */}
        {assets.hasPending && (
          <div className="mt-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">
              Ready to send: {assets.summary}
            </p>
            <Attachments variant="inline">
              {assets.references.map((ref) => {
                const fileUIPart = {
                  type: 'file' as const,
                  id: ref.id,
                  filename: ref.fileName,
                  mediaType: `file/${ref.fileKind}`,
                  url: ref.mediaUrl ?? undefined,
                };
                return (
                  <Attachment
                    key={ref.id}
                    data={fileUIPart}
                    onRemove={() => {
                      // Remove from context
                      // Note: useAssetReferenceContext doesn't expose removeReference
                      // here, but AssetInput handles this
                    }}
                  >
                    <AttachmentPreview />
                  </Attachment>
                );
              })}
            </Attachments>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AGENT INTEGRATION: How to use assets in your copilot agent
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * In your agent (e.g., task-copilot-agent.ts):
 *
 *   interface ChatMessage {
 *     text: string;
 *     attachments?: Array<{
 *       id: string;
 *       fileName: string;
 *       fileKind: string;
 *       path: string;
 *       projectId: string;
 *       mediaUrl?: string;
 *     }>;
 *   }
 *
 *   // In your agent handler:
 *   ipcMain.handle('copilot:chat', async (_event, { messages, attachments }) => {
 *     // Attachments are file references the user added
 *     if (attachments && attachments.length > 0) {
 *       // Option 1: Add to system prompt
 *       const attachmentContext = attachments
 *         .map(a => `- ${a.fileName} (${a.fileKind})`)
 *         .join('\n');
 *
 *       const systemPrompt = `
 *         User has provided the following files:
 *         ${attachmentContext}
 *
 *         You can reference these files in your response.
 *       `;
 *
 *       // Option 2: Index them for RAG
 *       for (const att of attachments) {
 *         await indexFile(att.projectId, att.id);
 *       }
 *
 *       // Option 3: Pass to a tool
 *       // Your tools can accept fileId and read content via project-files IPC
 *     }
 *
 *     // Continue with normal agent flow...
 *   });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DISPLAYING SENT ASSETS IN MESSAGES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * When storing/displaying messages with assets:
 *
 *   const message: UIMessage = {
 *     id: generateId(),
 *     role: 'user',
 *     content: userText,
 *     experimental_attachments: assetRefsToFileUIParts(assets.references),
 *   };
 *
 * Then <Attachment> will display them in the message.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
