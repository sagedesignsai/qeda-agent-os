/**
 * __tests__/code-indexing.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The pure source indexing policy: common source is included while credentials,
 * generated output, dependencies, and binary/lock formats are excluded.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { isIndexableCodePath } from '@/lib/code-indexing';

describe('isIndexableCodePath', () => {
  it('includes source, project docs, and common build configuration', () => {
    for (const path of [
      'src/main.ts',
      'README.md',
      'package.json',
      'Dockerfile',
      'docs/architecture.mdx',
    ]) {
      expect(isIndexableCodePath(path)).toBe(true);
    }
  });

  it('excludes ignored, generated, lock, and secret-looking paths', () => {
    for (const path of [
      '.env.local',
      'src/service-account.json',
      'config/private-key.ts',
      'src/api-token.ts',
      'node_modules/library/index.js',
      'dist/bundle.js',
      'package-lock.json',
      'certs/client.pem',
    ]) {
      expect(isIndexableCodePath(path)).toBe(false);
    }
  });
});
