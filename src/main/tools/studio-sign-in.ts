import { tool } from 'ai';
import { z } from 'zod';
import type { StudioSignInOutcome } from '../../lib/studio/types.js';
import { focusBrowser } from '../browser-use.js';
import { hasActiveStudioRecording } from '../studio-recorder.js';

export function createStudioSignInTool(
  requestConfirmation: (browserId: string) => Promise<StudioSignInOutcome>,
) {
  return tool({
    description:
      'Bring an open app browser to the front and pause for the user to sign in or complete MFA. Recording must not be active during this handoff. After confirmation, recording can start; canceling or timing out stops the current copilot turn.',
    inputSchema: z.object({
      browserId: z
        .string()
        .describe('Browser window id returned by openBrowser.'),
    }),
    execute: async ({ browserId }) => {
      try {
        if (hasActiveStudioRecording()) {
          throw new Error(
            'Stop the demo recording before asking the user to sign in, so the login screen is not captured.',
          );
        }

        focusBrowser(browserId);
        const outcome = await requestConfirmation(browserId);
        if (outcome !== 'confirmed') {
          return {
            success: false,
            cancelled: outcome === 'cancelled',
            expired: outcome === 'expired',
            error:
              outcome === 'expired'
                ? 'The sign-in confirmation expired. No recording was started.'
                : 'The user cancelled sign-in. No recording was started.',
          };
        }

        focusBrowser(browserId);
        return {
          success: true,
          confirmed: true,
          browserId,
          message:
            'The user confirmed sign-in. Continue with the requested demo; recording has not started yet.',
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
