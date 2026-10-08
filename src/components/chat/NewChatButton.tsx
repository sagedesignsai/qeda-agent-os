/**
 * components/chat/NewChatButton.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The visible way out of a conversation and back to the blank start screen.
 *
 * The two existing "New chat" controls — the sidebar's ChatMenu and the ⌘K
 * palette — sit two levels deep in a rail that starts collapsed, and one of
 * them behind a global shortcut. Inside a conversation the only in-page way
 * back was the `Chat` breadcrumb crumb. This is the affordance that was
 * missing, and it is deliberately always visible rather than one more entry
 * in the header's overflow menu: burying the thing this screen was missing
 * would reproduce the problem.
 *
 * NAVIGATE ONLY — it never calls `sessions:create`. The conversation is
 * created by its first message (Chat's `handleSend`), so leaving one here, or
 * never opening one at all, leaves no empty conversation behind. This is the
 * same semantic as the sidebar's "New chat"; the two must stay in step.
 *
 * The destination arrives pre-scoped from the caller (`withScope('/chat')`) so
 * `?project=` survives, exactly as the Chat breadcrumb does. Passing it in
 * rather than calling `useProjectScope` here keeps one subscription and stops
 * the crumb and this button from ever disagreeing about where "Chat" is.
 *
 * It stays enabled on the blank start screen, where there is nothing to clear
 * and no conversation to leave. Hiding it there would make the control jump
 * around a cluster that is `flex-nowrap` by contract, and disabling it reads
 * as a broken button sitting beside two live ones. One dead click on a screen
 * that is already a new chat is the cheaper mistake.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useNavigate } from 'react-router';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NewChatButtonProps {
  /** Destination, project scope included — pass `withScope('/chat')`. */
  to: string;
  /**
   * Runs immediately before navigating. Chat uses it to drop the page/notebook
   * context bound to the conversation being left.
   */
  onReset?: () => void;
}

export function NewChatButton({ to, onReset }: NewChatButtonProps) {
  const navigate = useNavigate();

  return (
    <Button
      size="sm"
      // Matches the "New task" / "New project" header actions on the
      // neighbouring screens: same height, gap, and label casing, so it reads
      // as part of the row rather than a control borrowed from elsewhere.
      className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
      onClick={() => {
        onReset?.();
        navigate(to);
      }}
    >
      <PlusIcon className="size-3" />
      New chat
    </Button>
  );
}
