import type { UIMessage } from 'ai';
import { ipcMain, type BrowserWindow } from 'electron';

import { prepareModelMessages } from '../../ai/messages.js';
import { createSvgAnimationAgent } from '../../ai/svg-animation-agent.js';
import type { SvgAnimationRequest } from '../../../lib/trace/animation-plan';

export function registerTraceSvgAnimationHandlers({ mainWindow }: { mainWindow: BrowserWindow }): void {
  const activeControllers = new Map<string, AbortController>();

  ipcMain.handle(
    'trace-svg-animation:chat',
    async (_event, req: { sessionId: string; messages: UIMessage[]; context: SvgAnimationRequest }) => {
      const { sessionId, messages, context } = req;
      const controller = new AbortController();
      activeControllers.set(sessionId, controller);
      const send = (channel: string, payload: unknown) => {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
      };

      try {
        const modelMessages = await prepareModelMessages(messages);
        const latestPrompt = messages
          .filter((message) => message.role === 'user')
          .at(-1)?.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
          .slice(0, 500);
        const request: SvgAnimationRequest = { ...context, prompt: latestPrompt };
        const { agent, getProposal, reviewProposal } = createSvgAnimationAgent(request);
        const result = await agent.stream({ messages: modelMessages, abortSignal: controller.signal });
        let streamError: unknown;
        let proposalValidationError: string | undefined;
        for await (const chunk of result.fullStream) {
          if (mainWindow.isDestroyed()) return;
          if (chunk?.type === 'error') {
            streamError = chunk.error;
            break;
          }
          if (chunk?.type === 'tool-error') {
            const toolError = chunk as { errorText?: string; error?: unknown };
            proposalValidationError = toolError.errorText ?? (toolError.error instanceof Error ? toolError.error.message : String(toolError.error ?? 'Tool validation failed.'));
          }
          send('trace-svg-animation:stream-chunk', JSON.stringify(chunk));
        }
        if (streamError) throw streamError;
        const finalText = await result.text;

        let proposal = getProposal();
        if (!proposal) throw new Error(proposalValidationError
          ? `The proposed animation was rejected: ${proposalValidationError}. The specialist could not produce a valid retry. ${finalText}`.trim()
          : finalText || 'The SVG specialist finished without proposing animation tracks.');
        if (!proposal.visualReview) {
          await reviewProposal(controller.signal);
          proposal = getProposal() ?? proposal;
        }
        send('trace-svg-animation:proposal', { sessionId, plan: proposal });
        send('trace-svg-animation:stream-done', { sessionId });
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        } else {
          send('trace-svg-animation:stream-error', {
            sessionId,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        }
      } finally {
        if (activeControllers.get(sessionId) === controller) activeControllers.delete(sessionId);
      }
    },
  );

  ipcMain.handle('trace-svg-animation:abort', async (_event, req?: { sessionId?: string }) => {
    const sessionId = req?.sessionId;
    if (!sessionId) return;
    const controller = activeControllers.get(sessionId);
    if (!controller) return;
    controller.abort();
    activeControllers.delete(sessionId);
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('agent:stream-cancelled', { sessionId });
  });
}
