/**
 * lib/asset-attachments-adapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Adapter between AssetReference system and AI SDK attachments.
 *
 * Converts:
 *   AssetReference[] ↔ FileUIPart[] (for display via <Attachment>)
 *   AssetReference[] ↔ Message attachments (for AI SDK)
 *
 * This is the glue between our asset system and the AI SDK's tool calling.
 * Agents see attachments and can decide how to use them (embed, index, etc.).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { FileUIPart, SourceDocumentUIPart } from 'ai';
import type { AssetReference } from '@/contexts/AssetReferenceContext';

/**
 * Convert an AssetReference to a FileUIPart for display.
 * FileUIParts are what <Attachment> components render.
 */
export function assetRefToFileUIPart(
  ref: AssetReference
): FileUIPart & { id: string } {
  return {
    type: 'file',
    id: ref.id,
    filename: ref.fileName,
    mediaType: getMimeTypeFromKind(ref.fileKind),
    url: ref.mediaUrl ?? undefined,
    data: Buffer.from(''), // Placeholder; actual data comes from agent
  };
}

/**
 * Convert multiple AssetReferences to FileUIParts.
 */
export function assetRefsToFileUIParts(
  refs: AssetReference[]
): (FileUIPart & { id: string })[] {
  return refs.map(assetRefToFileUIPart);
}

/**
 * Get MIME type from asset kind for AI SDK compatibility.
 */
function getMimeTypeFromKind(kind: string): string {
  switch (kind) {
    case 'image':
      return 'image/*';
    case 'video':
      return 'video/*';
    case 'audio':
      return 'audio/*';
    case 'document':
      return 'application/pdf';
    case 'text':
      return 'text/plain';
    case 'code':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Create an attachment object for sending with an AI SDK message.
 * This is what the agent will receive and can work with.
 */
export interface SendableAttachment {
  id: string;
  fileName: string;
  fileKind: string;
  path: string;
  projectId: string;
  mediaUrl: string | null;
  /** Metadata specific to this message context */
  metadata?: {
    addedAt?: number;
    context?: string;
    [key: string]: unknown;
  };
}

/**
 * Convert AssetReferences to sendable attachments for the agent.
 * Include enough info for the agent to fetch/reference the file.
 */
export function assetRefsToAttachments(
  refs: AssetReference[]
): SendableAttachment[] {
  return refs.map((ref) => ({
    id: ref.id,
    fileName: ref.fileName,
    fileKind: ref.fileKind,
    path: ref.path,
    projectId: ref.projectId,
    mediaUrl: ref.mediaUrl,
    metadata: {
      addedAt: ref.importedAt,
    },
  }));
}

/**
 * Create a summary string for logging/debugging.
 * Shows what attachments are being sent with a message.
 */
export function summarizeAttachments(
  refs: AssetReference[]
): string {
  if (refs.length === 0) return 'no attachments';
  const counts = new Map<string, number>();
  for (const ref of refs) {
    counts.set(ref.fileKind, (counts.get(ref.fileKind) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([kind, count]) => `${count} ${kind}`)
    .join(', ');
}

/**
 * Message payload with attachments (what gets sent to the agent).
 * This is the shape you pass to window.electron.ipc or API endpoints.
 */
export interface MessageWithAttachments {
  text: string;
  attachments: SendableAttachment[];
}

/**
 * Create a message with attachments from text and refs.
 */
export function createMessageWithAttachments(
  text: string,
  refs: AssetReference[]
): MessageWithAttachments {
  return {
    text,
    attachments: assetRefsToAttachments(refs),
  };
}

/**
 * Helper to pass attachments to AI SDK for tool calling.
 * Use this to include asset references in agent context.
 *
 * Example:
 *   const agent = createToolUseAgent({
 *     tools: myTools,
 *     system: `You have access to these files: ${formatAttachmentsForSystem(refs)}`
 *   });
 */
export function formatAttachmentsForSystem(refs: AssetReference[]): string {
  if (refs.length === 0) return 'no files provided';
  return refs
    .map((ref) => `- ${ref.fileName} (${ref.fileKind})`)
    .join('\n');
}
