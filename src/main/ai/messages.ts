/**
 * ai/messages.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Helpers for converting and sanitizing UIMessages for LanguageModel consumption.
 *
 * Problem:
 * In multi-turn conversations, reasoning models (e.g. on Groq or DeepSeek)
 * stream chain-of-thought reasoning which is captured in UIMessage.parts as
 * `{ type: 'reasoning', ... }`.
 * When converted to ModelMessage and passed to `@ai-sdk/openai-compatible`, the
 * adapter injects `{ reasoning_content: "..." }` into the assistant message.
 * Strict OpenAI-compatible endpoints like Groq (`api.groq.com/openai/v1`) reject
 * this with HTTP 400:
 *   "for 'role:assistant' the following must be satisfied: property 'reasoning_content' is unsupported"
 *
 * Solution:
 * Strip reasoning parts from prior assistant messages before feeding them into
 * the model. The client UI retains the reasoning parts for user display and
 * persistence, but the model only needs the visible text/tool-call outputs for
 * context in subsequent turns.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { convertToModelMessages, type UIMessage, type ModelMessage } from 'ai';

/**
 * Remove reasoning parts from assistant messages in a UIMessage list so that
 * downstream model adapters do not send `reasoning_content` to providers that
 * do not support it.
 */
export function sanitizeUIMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((msg) => {
    if (msg.role !== 'assistant' || !Array.isArray(msg.parts)) {
      return msg;
    }
    const filteredParts = msg.parts.filter(
      (part) =>
        part.type !== 'reasoning' &&
        (part as { type: string }).type !== 'reasoning-file',
    );
    return {
      ...msg,
      parts:
        filteredParts.length > 0
          ? filteredParts
          : [{ type: 'text' as const, text: '' }],
    };
  });
}

/**
 * Ensure no reasoning parts remain in ModelMessage assistant content arrays.
 */
export function sanitizeModelMessages(
  messages: ModelMessage[],
): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== 'assistant') {
      return msg;
    }
    if (typeof msg.content === 'string') {
      return msg;
    }
    if (Array.isArray(msg.content)) {
      const filtered = msg.content.filter(
        (part) => part.type !== 'reasoning' && part.type !== 'reasoning-file',
      );
      return {
        ...msg,
        content:
          filtered.length > 0
            ? filtered
            : [{ type: 'text' as const, text: '' }],
      };
    }
    return msg;
  });
}

/**
 * Convert UIMessages to ModelMessages while guaranteeing that prior reasoning
 * tokens are not passed back as `reasoning_content` to the LLM provider.
 */
export async function prepareModelMessages(
  messages: UIMessage[],
): Promise<ModelMessage[]> {
  const cleanUI = sanitizeUIMessages(messages);
  const rawModel = await convertToModelMessages(cleanUI);
  return sanitizeModelMessages(rawModel);
}
