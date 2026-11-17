/** 
 * components/workspace/WorkspaceChatPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Docked chat side panel for the Workspace editor.
 *
 * Conversation is scoped to the current page/notebook through `useAgentChat`
 * (session `workspace-page:<pageId>`, context `{ pageId, notebookId,
 * projectId }`) and reuses the exact `Conversation` + `MessageList` +
 * `PromptInput` frame as the task copilot (`CopilotPanel`) and the Studio
 * copilot sheet, so an agent turn looks identical wherever it happens.
 *
 * The thread persists per page (`persist: true`, `hydrate: true`), so
 * reopening the panel on the same page resumes the conversation.
 *
 * Features
 *   • Streaming responses with tool cards, approval cards, markdown
 *   • Live agent plan (PlanPanel) while a turn is streaming
 *   • Provider fallback notice
 *   • "Append last reply to page" → host appends the assistant's last message
 *     as a new block in the open page (fired via onAppendToPage)
 * ─────────────────────────────────────────────────────────────────────────
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import {
  BotIcon,
  CopyIcon,
  Loader2Icon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MessageList } from '@/components/chat/MessageList';
import { PlanPanel } from '@/components/plan/PlanPanel';
import { useAgentChat } from '@/hooks/use-agent-chat';
import { useIpcPlan } from '@/hooks/use-agent-plan';
import { toast } from 'sonner';

interface WorkspaceChatPanelProps {
  pageId: string;
  notebookId?: string | null;
  projectId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired with the assistant's last reply so the host can append it as a block. */
  onAppendToPage?: (text: string) => void;
}

const WORKSPACE_CHAT_SUGGESTIONS = [
  {
    label: 'Summarize this page',
    prompt: 'Summarize the key points of this page in a few bullets.',
  },
  {
    label: 'Turn this into tasks',
    prompt: 'Read this page and turn actionable items into a task list I can convert to tasks.',
  },
  {
    label: 'Research this topic',
    prompt: 'Research the main topic of this page and bring back sources and a short briefing.',
  },
  {
    label: 'Draft a follow-up',
    prompt: 'Draft a follow-up note based on this page that I can append below.',
  },
];

export function WorkspaceChatPanel({
  pageId,
  notebookId,
  projectId,
  open,
  onOpenChange,
  onAppendToPage,
}: WorkspaceChatPanelProps) {
  const sessionId = `workspace-page-${pageId}`;

  const {
    messages,
    status,
    error,
    fallbackNotice,
    dismissFallbackNotice,
    sendMessage,
    respondToApproval,
    clearMessages,
  } = useAgentChat({
    sessionId,
    context: {
      pageId,
      ...(notebookId ? { notebookId } : {}),
      ...(projectId ? { projectId } : {}),
    },
    persist: true,
    hydrate: true,
  });

  const { plan, clearPlan } = useIpcPlan('agent:plan-event', messages, sessionId);

  const [appendTarget, setAppendTarget] = useState<string | null>(null);

  const lastAssistantText = useRef<string>('');

  // Keep the last assistant message text so "Append to page" can grab it.
  useEffect(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === 'assistant') {
        lastAssistantText.current = m.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('');
        break;
      }
    }
  }, [messages]);

  const handleClear = () => {
    clearPlan();
    clearMessages();
    setAppendTarget(null);
    lastAssistantText.current = '';
  };

  const handleAppend = () => {
    const text = lastAssistantText.current.trim();
    if (!text) {
      toast.error('Nothing to append yet.');
      return;
    }
    setAppendTarget(text);
    onAppendToPage?.(text);
    toast.success('Appended to page.');
  };

  // Auto-focus the input when the panel opens.
  useEffect(() => {
    if (!open) return;
    // intentional no-op: PromptInput manages its own focus; kept for parity
  }, [open]);

  const emptyState = (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
        <BotIcon className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-medium text-sm">Chat about this page</h3>
        <p className="text-xs text-muted-foreground">
          Ask questions, draft notes, or plan next steps. Replies can be
          appended straight into the page.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full items-center">
        {WORKSPACE_CHAT_SUGGESTIONS.map((s, idx) => (
          <Button
            key={idx}
            variant="outline"
            size="sm"
            className="w-full md:w-48 text-xs text-left"
            onClick={() => sendMessage(s.prompt)}
          >
            <SparklesIcon className="mr-1.5 size-3.5" />
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col border-l border-border/60 bg-background">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2 bg-background/50 backdrop-blur-xs">
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BotIcon className="size-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">Page chat</div>
            <div className="text-[10px] text-muted-foreground truncate">
              Scoped to current page
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {status === 'streaming' && (
            <Badge variant="secondary" className="h-6 px-1.5 text-[10px]">
              <Loader2Icon className="mr-1 size-3 animate-spin" /> Thinking
            </Badge>
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6 text-xs"
            onClick={handleClear}
            disabled={messages.length === 0}
            title={messages.length === 0 ? 'No messages yet' : 'Clear conversation'}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6 text-xs"
            onClick={() => onOpenChange(false)}
            title="Close chat panel"
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Conversation ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <Conversation className="flex-1 overflow-y-auto">
          <ConversationContent className="p-0 pb-20">
            {messages.length === 0 && status === 'ready' ? (
              emptyState
            ) : (
              <MessageList
                messages={messages}
                status={status}
                error={error}
                onApproval={respondToApproval}
                emptyState={null}
                onRetry={(text) => sendMessage(text)}
              />
            )}
          </ConversationContent>
          <ConversationScrollButton />
          {plan && (
            <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-2 bg-background/80 backdrop-blur-xs border-t border-border/40">
              <PlanPanel
                plan={plan}
                isRunning={status === 'streaming'}
                title="Agent plan"
                defaultCollapsed
                compact
              />
            </div>
          )}
        </Conversation>
      </div>

      {/* ── Fallback notice ──────────────────────────────────────────────── */}
      {fallbackNotice && (
        <div className="mx-2 my-1.5 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-500">
          <span className="truncate">
            Provider <strong>{fallbackNotice.fromProvider}</strong>{' '}
            unavailable ({fallbackNotice.reason}) — switched to{' '}
            <strong>{fallbackNotice.toProvider}</strong>
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-5 shrink-0 text-amber-500 hover:text-amber-400"
            onClick={dismissFallbackNotice}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mx-2 mb-1.5 text-xs">
          <AlertTitle>Chat error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {/* ── Append last reply ────────────────────────────────────────────── */}
      {lastAssistantText.current && onAppendToPage && (
        <div className="flex items-center justify-between border-t border-border/40 px-3 py-2 bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAppend}
            disabled={appendTarget === lastAssistantText.current}
            className="h-7 text-[11px] flex items-center gap-1.5"
          >
            {appendTarget === lastAssistantText.current ? (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                <span>Appending…</span>
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5" />
                <span>Append last reply to page</span>
              </>
            )}
          </Button>
          <Badge
            variant="secondary"
            className="h-6 px-1.5 text-[10px] text-muted-foreground"
          >
            {Math.ceil(lastAssistantText.current.length / 5)} est. block{"s"}
          </Badge>
        </div>
      )}

      {/* ── Prompt input ─────────────────────────────────────────────────── */}
      <div className="border-t border-border/60 p-2 bg-background/40 backdrop-blur-xs">
        <PromptInput
          onSubmit={({ text }) => {
            const value = text.trim();
            if (value) sendMessage(value);
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask about this page…"
              className="text-xs min-h-[44px]"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-muted-foreground"
                onClick={handleClear}
                disabled={messages.length === 0}
              >
                Clear
              </Button>
            </PromptInputTools>
            <PromptInputSubmit
              status={status}
              disabled={status === 'streaming'}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
