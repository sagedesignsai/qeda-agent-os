/**
 * __tests__/opencode-session-binding.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The plugin is global; only the Qeda-created OpenCode session may drive Qeda's
 * active workspace through the bridge.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { assertQedaToolSession } from '@/main/opencode/session-binding';

describe('assertQedaToolSession', () => {
  it('accepts a tool call from the active Qeda session', () => {
    expect(() =>
      assertQedaToolSession({ qedaSessionID: 'ses-qeda' }, 'ses-qeda'),
    ).not.toThrow();
  });

  it('rejects a call from another OpenCode session', () => {
    expect(() =>
      assertQedaToolSession({ qedaSessionID: 'ses-other' }, 'ses-qeda'),
    ).toThrow('not bound');
  });

  it('rejects missing session ids and missing active sessions', () => {
    expect(() => assertQedaToolSession({}, 'ses-qeda')).toThrow('not bound');
    expect(() => assertQedaToolSession(null, 'ses-qeda')).toThrow('not bound');
    expect(() =>
      assertQedaToolSession({ qedaSessionID: 'ses-qeda' }, null),
    ).toThrow('No active Qeda Builder session');
  });
});
