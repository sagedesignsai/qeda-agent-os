/**
 * tools/navigation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * First-class in-app navigation tools for the autonomous operator (and chat
 * agent). These tools use the existing `ui:navigate` IPC channel — the same
 * one the system tray and menu accelerators use — so the renderer's
 * NavigationBridge in App.tsx picks them up without any new wiring.
 *
 * Valid routes (from renderer/routes.tsx):
 *   /tasks  /projects  /presence  /motion  /trace  /builder
 *   /documents  /studio  /music  /terminal  /chat  /workspace  /offline-ai
 *   Sub-routes with IDs: /studio/:takeId  /documents/:documentId  etc.
 *
 * Why a dedicated tool and not `click` on the sidebar?
 *   • Deterministic — no accessibility-tree discovery needed
 *   • Idempotent — calling it twice just re-renders the same route
 *   • Zero layout dependency — works even when sidebar items are collapsed
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { tool } from 'ai';
import { z } from 'zod';
import { BrowserWindow } from 'electron';

function getMainWindow(): BrowserWindow | null {
  return (
    BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null
  );
}

/** Known top-level routes for schema validation and agent guidance. */
const KNOWN_ROUTES = [
  '/tasks',
  '/projects',
  '/presence',
  '/motion',
  '/trace',
  '/builder',
  '/documents',
  '/studio',
  '/music',
  '/terminal',
  '/chat',
  '/workspace',
  '/offline-ai',
  '/onboarding',
] as const;

export const navigationTools = {
  /**
   * Navigate Qeda to a specific page/route. Equivalent to the user clicking
   * a sidebar nav item. Use before interacting with a page via getAppState /
   * click / setValue to ensure the right view is in focus.
   */
  navigatePage: tool({
    description:
      'Navigate the Qeda application to a specific page or route (e.g. "/studio", "/tasks", "/documents/:id"). ' +
      'Call this before using getAppState/click/setValue on a view to ensure the target page is active. ' +
      `Known top-level routes: ${KNOWN_ROUTES.join(', ')}. Sub-routes with IDs are also valid (e.g. "/studio/abc123").`,
    inputSchema: z.object({
      route: z
        .string()
        .min(1)
        .describe('The absolute route path starting with "/" (e.g. "/tasks", "/studio/abc123").'),
      reason: z
        .string()
        .optional()
        .describe('Brief human-readable reason for navigating — written to the audit log.'),
    }),
    execute: async ({ route, reason }) => {
      if (!route.startsWith('/')) {
        return { success: false as const, error: `Route must start with "/", got: "${route}"` };
      }

      const win = getMainWindow();
      if (!win) {
        return { success: false as const, error: 'No Qeda window found.' };
      }

      try {
        win.webContents.send('ui:navigate', { path: route });
        return {
          success: true as const,
          route,
          ...(reason ? { reason } : {}),
          message: `Navigated to ${route}`,
        };
      } catch (e) {
        return { success: false as const, error: (e as Error).message };
      }
    },
  }),

  /**
   * Read-only: returns the current active route from the renderer. Useful for
   * situational awareness before deciding whether to call navigatePage.
   */
  getActiveRoute: tool({
    description:
      'Get the current active route/page of the Qeda application. ' +
      'Use for situational awareness before navigating or interacting with the UI.',
    inputSchema: z.object({}),
    execute: async () => {
      const win = getMainWindow();
      if (!win) {
        return { success: false as const, error: 'No Qeda window found.' };
      }

      try {
        // Execute JS in the renderer context to read the current MemoryRouter location.
        const route = await win.webContents.executeJavaScript(
          `window.__qeda_active_route__ || window.location.hash.replace('#', '') || '(unknown)'`,
        );
        return { success: true as const, route: String(route) };
      } catch (e) {
        return { success: false as const, error: (e as Error).message };
      }
    },
  }),
};
