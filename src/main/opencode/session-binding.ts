/**
 * main/opencode/session-binding.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Qeda plugin is installed globally, so OpenCode exposes its `qeda_*` tools
 * to every session, not just the Qeda-created one. The bridge token is shared
 * per Qeda launch, so each tool call must also prove which OpenCode session it
 * came from before it may touch Qeda's active workspace.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function assertQedaToolSession(
  body: unknown,
  activeSessionId: string | null,
): void {
  if (!activeSessionId) {
    throw new Error('No active Qeda Builder session.');
  }
  const sessionId =
    body && typeof body === 'object'
      ? (body as { qedaSessionID?: unknown }).qedaSessionID
      : undefined;
  if (typeof sessionId !== 'string' || sessionId !== activeSessionId) {
    throw new Error(
      'This OpenCode session is not bound to the active Qeda Builder session.',
    );
  }
}
