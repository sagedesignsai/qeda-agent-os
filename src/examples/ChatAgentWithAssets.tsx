/**
 * examples/ChatAgentWithAssets.tsx
 * ──────────────────────────────────────────────────────────────────────────
 * Real-world example: Adding asset reference support to the Chat surface.
 *
 * This shows how to:
 * - Display referenced assets in the chat UI
 * - Include them when sending messages to the agent
 * - Let users manage the reference list
 * - Persist references across sessions
 * ──────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router';
import { SendIcon, PlusIcon, TrashIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AssetPicker, useAssetPicker, AssetReferencesPanel } from '@/components/assets';
import { usePersistentAssets } from '@/hooks/use-persistent-assets';
import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';
import type { ProjectFileSelection } from '@/lib/project-files';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  assetReferences?: AssetReference[];
}

interface AssetReference {
  id: string;
  fileName: string;
  fileKind: string;
  path: string;
  mediaUrl: string | null;
}

export function ChatWithAssets() {
  const { sessionId, projectId } = useParams<{
    sessionId: string;
    projectId: string;
  }>();

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Asset reference management
  const contextId = `chat-${sessionId}`;
  const assetPicker = useAssetPicker(contextId);
  const { references } = usePersistentAssets(contextId, `chat:${sessionId}:assets`);

  // Handle user message
  const handleSendMessage = useCallback(async () => {
    if (!input.trim() && references.length === 0) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      assetReferences:
        references.length > 0
          ? references.map((ref) => ({
              id: ref.id,
              fileName: ref.fileName,
              fileKind: ref.fileKind,
              path: ref.path,
              mediaUrl: ref.mediaUrl,
            }))
          : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      // Send to your agent/API endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
          projectId,
        }),
      });

      if (response.ok) {
        const assistantMessage: Message = await response.json();
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  }, [input, references, sessionId, projectId]);

  // Keyboard shortcut
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-lg rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

              {msg.assetReferences && msg.assetReferences.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-current border-opacity-20 pt-2">
                  <p className="text-xs opacity-80 font-medium">Attachments:</p>
                  <ul className="space-y-0.5">
                    {msg.assetReferences.map((ref) => (
                      <li key={ref.id} className="text-xs opacity-75">
                        📎 {ref.fileName} ({ref.fileKind})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-4 justify-start">
            <div className="bg-muted text-muted-foreground rounded-lg p-3">
              <p className="text-sm animate-pulse">Thinking...</p>
            </div>
          </div>
        )}
      </div>

      {/* Asset references panel */}
      <div className="shrink-0 border-t p-4">
        {references.length > 0 && (
          <div className="mb-4">
            <AssetReferencesPanel contextId={contextId} showEmpty={false} compact />
          </div>
        )}

        {/* Input area */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Ctrl+Enter to send)"
              className="min-h-12 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              disabled={sending}
            />
            <div className="flex flex-col gap-1">
              <Button
                onClick={() => assetPicker.open()}
                size="icon"
                variant="outline"
                disabled={sending}
                title="Add files"
              >
                <PlusIcon className="size-4" />
              </Button>
              <Button
                onClick={handleSendMessage}
                size="icon"
                disabled={sending || (!input.trim() && references.length === 0)}
                title="Send message (Ctrl+Enter)"
              >
                <SendIcon className="size-4" />
              </Button>
            </div>
          </div>

          {references.length > 0 && (
            <p className="text-xs text-muted-foreground text-right">
              {references.length} file{references.length !== 1 ? 's' : ''} will be sent
            </p>
          )}
        </div>
      </div>

      {/* Asset picker dialog */}
      <AssetPicker
        open={assetPicker.isOpen}
        onOpenChange={assetPicker.toggle}
        contextId={contextId}
        kind="all"
        projectId={projectId}
        multiple
      />
    </div>
  );
}

/**
 * ──────────────────────────────────────────────────────────────────────────
 * INTEGRATION WITH YOUR AGENT
 * ──────────────────────────────────────────────────────────────────────────
 *
 * When the chat sends assetReferences, your agent can:
 *
 * 1. Index the files if they're documents
 *    context.indexFile(projectId, fileId)
 *
 * 2. Read the file content
 *    window.electron.ipc.invoke('project-files:read-text', {
 *      projectId: ref.projectId,
 *      fileId: ref.id
 *    })
 *
 * 3. Use them in tool calls
 *    E.g., a "reference this code" tool that adds context to the prompt
 *
 * 4. Mention them in reasoning
 *    "User provided a code file. I should analyze it as part of my response."
 *
 * ──────────────────────────────────────────────────────────────────────────
 * DATABASE SCHEMA (for persistence)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * When you're ready to persist message attachments in the chat history:
 *
 * ALTER TABLE messages ADD COLUMN asset_references_json TEXT;
 *
 * Before saving a message:
 *   const stored = {
 *     ...message,
 *     asset_references_json: JSON.stringify(message.assetReferences),
 *   };
 *
 * When loading:
 *   message.assetReferences = message.asset_references_json
 *     ? JSON.parse(message.asset_references_json)
 *     : [];
 *
 * ──────────────────────────────────────────────────────────────────────────
 */

export default ChatWithAssets;
