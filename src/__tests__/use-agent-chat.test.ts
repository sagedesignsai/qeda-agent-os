import type { UIMessage } from 'ai';
import { applyStreamPart } from '../hooks/use-agent-chat';

/**
 * These tests pin down the shape contract between the agent's `fullStream`
 * (TextStreamPart) and the UIMessages the UI renders. The original
 * implementation read `chunk.textDelta`, which does not exist on a text-delta
 * part, so assistant text silently rendered as empty strings.
 */

type DraftPart = { type: string } & Record<string, unknown>;

const partsOf = (messages: UIMessage[]): DraftPart[] =>
  messages[messages.length - 1].parts as unknown as DraftPart[];

const fold = (parts: Array<Record<string, unknown>>): UIMessage[] =>
  parts.reduce<UIMessage[]>((acc, part) => applyStreamPart(acc, part as never), []);

describe('applyStreamPart', () => {
  it('accumulates assistant text from `text` deltas', () => {
    const messages = fold([
      { type: 'text-start', id: 't1' },
      { type: 'text-delta', id: 't1', text: 'Hello' },
      { type: 'text-delta', id: 't1', text: ', world' },
      { type: 'text-end', id: 't1' },
    ]);

    expect(partsOf(messages)).toEqual([{ type: 'text', text: 'Hello, world' }]);
  });

  it('starts a new text part after an interleaved tool call', () => {
    const messages = fold([
      { type: 'text-delta', text: 'Let me check. ' },
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'runShell',
        input: { command: 'ls' },
      },
      { type: 'text-delta', text: 'Done.' },
    ]);

    expect(partsOf(messages)).toEqual([
      { type: 'text', text: 'Let me check. ' },
      {
        type: 'tool-runShell',
        toolCallId: 'c1',
        toolName: 'runShell',
        input: { command: 'ls' },
        state: 'input-available',
      },
      { type: 'text', text: 'Done.' },
    ]);
  });

  it('marks a tool part awaiting approval and records the approval id', () => {
    const messages = fold([
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'runShell',
        input: { command: 'rm -rf /' },
      },
      {
        type: 'tool-approval-request',
        approvalId: 'a1',
        reason: 'requires approval',
        toolCall: { toolCallId: 'c1', toolName: 'runShell' },
      },
    ]);

    expect(partsOf(messages)[0]).toMatchObject({
      type: 'tool-runShell',
      state: 'approval-requested',
      approval: { id: 'a1', requestReason: 'requires approval' },
    });
  });

  it('fills in the tool output when the result arrives', () => {
    const messages = fold([
      { type: 'tool-call', toolCallId: 'c1', toolName: 'runShell', input: {} },
      { type: 'tool-result', toolCallId: 'c1', output: { success: true } },
    ]);

    expect(partsOf(messages)[0]).toMatchObject({
      state: 'output-available',
      output: { success: true },
    });
  });

  it('records tool errors and denial', () => {
    const errored = fold([
      { type: 'tool-call', toolCallId: 'c1', toolName: 'runShell', input: {} },
      { type: 'tool-error', toolCallId: 'c1', error: 'boom' },
    ]);
    expect(partsOf(errored)[0]).toMatchObject({
      state: 'output-error',
      errorText: 'boom',
    });

    const denied = fold([
      { type: 'tool-call', toolCallId: 'c2', toolName: 'runShell', input: {} },
      { type: 'tool-output-denied', toolCallId: 'c2' },
    ]);
    expect(partsOf(denied)[0]).toMatchObject({ state: 'output-denied' });
  });

  it('ignores chunks that are not rendered', () => {
    const messages = fold([
      { type: 'start' },
      { type: 'start-step' },
      { type: 'finish-step' },
      { type: 'finish' },
    ]);

    expect(messages).toEqual([]);
  });
});
