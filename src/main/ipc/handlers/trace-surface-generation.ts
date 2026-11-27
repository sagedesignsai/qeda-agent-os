import type { UIMessage } from 'ai';
import { ipcMain, type BrowserWindow } from 'electron';

import { prepareModelMessages } from '../../ai/messages.js';
import { createSurfaceAgent } from '../../ai/surface-agent.js';
import type { SurfaceGenerationRequest } from '../../../lib/trace/addons/surfaces/generation';

export function registerTraceSurfaceGenerationHandlers({
  mainWindow,
}: {
  mainWindow: BrowserWindow;
}): void {
  const activeControllers = new Map<string, AbortController>();

  ipcMain.handle(
    'trace-surface-generation:chat',
    async (
      _event,
      req: {
        sessionId: string;
        messages: UIMessage[];
        context: SurfaceGenerationRequest;
      },
    ) => {
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
          .slice(0, 800);
        const request: SurfaceGenerationRequest = {
          ...context,
          prompt: latestPrompt || context.prompt,
        };
        const { agent, getProposal } = createSurfaceAgent(request);
        const result = await agent.stream({
          messages: modelMessages,
          abortSignal: controller.signal,
        });
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
            proposalValidationError =
              toolError.errorText ??
              (toolError.error instanceof Error
                ? toolError.error.message
                : String(toolError.error ?? 'Tool validation failed.'));
          }
          send('trace-surface-generation:stream-chunk', JSON.stringify(chunk));
        }
        if (streamError) throw streamError;
        const finalText = await result.text;
        const proposal = getProposal();
        if (!proposal) {
          throw new Error(
            proposalValidationError
              ? `The proposed surface was rejected: ${proposalValidationError}. The specialist could not produce a valid retry. ${finalText}`.trim()
              : finalText ||
                  'The Surface Specialist finished without a valid surface proposal.',
          );
        }
        send('trace-surface-generation:proposal', { sessionId, proposal });
        send('trace-surface-generation:stream-done', { sessionId });
      } catch (cause) {
        if (controller.signal.aborted) return;
        send('trace-surface-generation:stream-error', {
          sessionId,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        if (activeControllers.get(sessionId) === controller) {
          activeControllers.delete(sessionId);
        }
      }
    },
  );

  ipcMain.handle(
    'trace-surface-generation:abort',
    async (_event, req?: { sessionId?: string }) => {
      const sessionId = req?.sessionId;
      if (!sessionId) return;
      const controller = activeControllers.get(sessionId);
      if (!controller) return;
      controller.abort();
      activeControllers.delete(sessionId);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent:stream-cancelled', { sessionId });
      }
    },
  );
}