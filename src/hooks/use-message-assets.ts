/**
 * hooks/use-message-assets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook to manage asset attachments for messages.
 *
 * Orchestrates:
 * - Asset reference context
 * - Conversion to AI SDK attachments
 * - Sending with messages
 * - Clearing after send
 *
 * Usage:
 *   const assets = useMessageAssets('chat-123');
 *   <ChatInput
 *     onSend={(text) => assets.sendWithAssets(text, sendMessage)}
 *     assetControls={<AssetInput contextId={assets.contextId} />}
 *   />
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from 'react';
import { useAssetReferenceContext } from '@/contexts/AssetReferenceContext';
import type { AssetReference } from '@/contexts/AssetReferenceContext';
import {
  createMessageWithAttachments,
  assetRefsToAttachments,
  summarizeAttachments,
} from '@/lib/asset-attachments-adapter';

export interface UseMessageAssetsOptions {
  /** Auto-clear assets after sending. Default: true */
  autoClearOnSend?: boolean;
  /** Log asset operations. Default: false */
  debug?: boolean;
}

export function useMessageAssets(
  contextId: string,
  options: UseMessageAssetsOptions = {}
) {
  const { autoClearOnSend = true, debug = false } = options;
  const { references, clearReferences } =
    useAssetReferenceContext(contextId);
  const [lastSentCount, setLastSentCount] = useState(0);

  /**
   * Send a message with current assets.
   * Calls your sendFn with the message and handles post-send cleanup.
   */
  const sendWithAssets = useCallback(
    async (
      text: string,
      sendFn: (messageText: string, attachments?: ReturnType<typeof assetRefsToAttachments>) => void | Promise<void>
    ) => {
      if (debug) {
        console.log(`[useMessageAssets] Sending with: ${summarizeAttachments(references)}`);
      }

      // Create attachments for the agent
      const attachments = assetRefsToAttachments(references);

      // Send (could be sync or async depending on sendFn)
      try {
        await sendFn(text, attachments);
        setLastSentCount(references.length);

        // Optionally clear after send
        if (autoClearOnSend && references.length > 0) {
          if (debug) console.log('[useMessageAssets] Auto-clearing assets');
          clearReferences();
        }
      } catch (err) {
        console.error('[useMessageAssets] Send failed:', err);
        throw err;
      }
    },
    [references, autoClearOnSend, clearReferences, debug]
  );

  /**
   * Send with a full message object (includes text).
   * Useful for when you already have a message shape.
   */
  const sendMessageWithAssets = useCallback(
    async (
      messageText: string,
      sendFn: (payload: { text: string; attachments: ReturnType<typeof assetRefsToAttachments> }) => void | Promise<void>
    ) => {
      const payload = createMessageWithAttachments(messageText, references);
      if (debug) {
        console.log(`[useMessageAssets] Sending message:`, payload);
      }

      try {
        await sendFn(payload);
        setLastSentCount(references.length);

        if (autoClearOnSend && references.length > 0) {
          clearReferences();
        }
      } catch (err) {
        console.error('[useMessageAssets] Send failed:', err);
        throw err;
      }
    },
    [references, autoClearOnSend, clearReferences, debug]
  );

  /**
   * Manual clear (if autoClearOnSend is false or for explicit cleanup).
   */
  const clear = useCallback(() => {
    if (debug) console.log('[useMessageAssets] Manual clear');
    clearReferences();
  }, [clearReferences, debug]);

  return {
    /** Current references */
    references,
    /** Context ID for scope */
    contextId,
    /** Number of assets to send */
    count: references.length,
    /** Summary string (e.g., "2 images, 1 document") */
    summary: summarizeAttachments(references),
    /** Send text + assets via your handler */
    sendWithAssets,
    /** Send message object + assets */
    sendMessageWithAssets,
    /** Manually clear assets */
    clear,
    /** Number of assets in last sent message */
    lastSentCount,
    /** Are there unsent assets? */
    hasPending: references.length > 0,
  };
}
