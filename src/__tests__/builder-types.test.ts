/**
 * __tests__/builder-types.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards the Builder's explicit OpenCode v2 compatibility boundary.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isSupportedOpenCodeVersion } from '@/lib/builder-types';

describe('isSupportedOpenCodeVersion', () => {
  it.each(['2.0.18', '2.0.24', '2.1.0'])('accepts OpenCode %s', (version) => {
    expect(isSupportedOpenCodeVersion(version)).toBe(true);
  });

  it.each(['1.9.9', '3.0.0', 'unknown', ''])(
    'rejects OpenCode %s',
    (version) => {
      expect(isSupportedOpenCodeVersion(version)).toBe(false);
    },
  );
});
