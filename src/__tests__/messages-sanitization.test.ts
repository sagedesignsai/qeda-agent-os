/**
 * __tests__/messages-sanitization.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies that assistant reasoning parts (chain-of-thought tokens from models
 * like DeepSeek-R1 or Groq gpt-oss-120b) are properly stripped from model inputs
 * on subsequent turns.
 *
 * This prevents @ai-sdk/openai-compatible from injecting `reasoning_content`
 * into assistant messages in requests to providers (like Groq) that reject it.
 * ─────────────────────────────────────────────────────────────────────────────
 */

jest.mock('ai', () => ({
  convertToModelMessages: jest.fn(async (messages: Array<{ role: string; parts?: Array<{ type: string; [key: string]: unknown }> }>) => {
    return messages.map((msg) => {
      if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: (msg.parts ?? []).map((p) => ({ ...p })),
        };
      }
      return {
        role: msg.role,
        content: (msg.parts ?? []).map((p) => ('text' in p ? String(p.text) : '')).join(''),
      };
    });
  }),
}));

import type { UIMessage, ModelMessage } from 'ai';
import {
  sanitizeUIMessages,
  sanitizeModelMessages,
  prepareModelMessages,
} from '../main/ai/messages';

describe('Message sanitization for OpenAI-compatible providers', () => {
  describe('sanitizeUIMessages', () => {
    it('preserves user messages intact even if they contain text or other parts', () => {
      const userMessage: UIMessage = {
        id: 'msg-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello, what can you do?' }],
      };

      const result = sanitizeUIMessages([userMessage]);
      expect(result).toEqual([userMessage]);
    });

    it('strips reasoning parts from assistant messages while preserving text and tool parts', () => {
      const assistantMessage: UIMessage = {
        id: 'msg-2',
        role: 'assistant',
        parts: [
          // testing reasoning part shape emitted by AI SDK (now typed by it)
          { type: 'reasoning', text: 'Thinking about how to answer...' },
          { type: 'text', text: 'Hello! I can help you manage tasks and focus.' },
        ],
      };

      const result = sanitizeUIMessages([assistantMessage]);
      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0]).toEqual({
        type: 'text',
        text: 'Hello! I can help you manage tasks and focus.',
      });
    });

    it('strips reasoning-file parts as well', () => {
      const assistantMessage: UIMessage = {
        id: 'msg-2',
        role: 'assistant',
        parts: [
          // @ts-expect-error - testing reasoning-file part shape
          { type: 'reasoning-file', data: 'some-data' },
          { type: 'text', text: 'Done.' },
        ],
      };

      const result = sanitizeUIMessages([assistantMessage]);
      expect(result[0].parts).toHaveLength(1);
      expect(result[0].parts[0]).toEqual({ type: 'text', text: 'Done.' });
    });

    it('provides a fallback empty text part if assistant message only had reasoning', () => {
      const assistantMessage: UIMessage = {
        id: 'msg-2',
        role: 'assistant',
        parts: [
          // testing pure reasoning (now typed by the AI SDK)
          { type: 'reasoning', text: 'Scratchpad thinking only' },
        ],
      };

      const result = sanitizeUIMessages([assistantMessage]);
      expect(result[0].parts).toEqual([{ type: 'text', text: '' }]);
    });
  });

  describe('sanitizeModelMessages', () => {
    it('preserves string content in assistant messages', () => {
      const msg: ModelMessage = {
        role: 'assistant',
        content: 'Simple string response',
      };
      const result = sanitizeModelMessages([msg]);
      expect(result).toEqual([msg]);
    });

    it('filters reasoning parts from assistant message content array', () => {
      const msg: ModelMessage = {
        role: 'assistant',
        content: [
          // reasoning content part shape (now typed by the AI SDK)
          { type: 'reasoning', text: 'Internal thoughts' },
          { type: 'text', text: 'Visible answer' },
        ],
      };
      const result = sanitizeModelMessages([msg]);
      expect(result[0].content).toEqual([{ type: 'text', text: 'Visible answer' }]);
    });
  });

  describe('prepareModelMessages', () => {
    it('converts multi-turn conversation with reasoning into clean ModelMessages without reasoning parts', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          parts: [{ type: 'text', text: 'hello' }],
        },
        {
          id: '2',
          role: 'assistant',
          parts: [
            // reasoning part (now typed by the AI SDK)
            { type: 'reasoning', text: 'The user is greeting me. I should greet them back.' },
            { type: 'text', text: 'Hey there! What is on your mind today?' },
          ],
        },
        {
          id: '3',
          role: 'user',
          parts: [{ type: 'text', text: 'what can you tell me about the current project' }],
        },
      ];

      const modelMessages = await prepareModelMessages(messages);

      expect(modelMessages).toHaveLength(3);
      expect(modelMessages[0].role).toBe('user');
      expect(modelMessages[1].role).toBe('assistant');
      expect(modelMessages[2].role).toBe('user');

      // Check assistant message content
      const assistantContent = modelMessages[1].content;
      if (Array.isArray(assistantContent)) {
        const hasReasoning = assistantContent.some(
          (part: { type: string }) => part.type === 'reasoning' || part.type === 'reasoning-file',
        );
        expect(hasReasoning).toBe(false);
        expect(assistantContent).toEqual([
          { type: 'text', text: 'Hey there! What is on your mind today?' },
        ]);
      }
    });
  });
});
