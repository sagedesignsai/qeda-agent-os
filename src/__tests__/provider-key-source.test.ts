/**
 * __tests__/provider-key-source.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Credential-source selection is explicit: choosing the environment must
 * bypass a saved key, and choosing Settings must not quietly fall back to a
 * different credential if its saved key is absent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { chooseProviderApiKey } from '../main/ai/registry';

describe('provider API key source selection', () => {
  it('uses the saved credential when Settings is selected', () => {
    expect(chooseProviderApiKey('settings', ' saved-key ', 'env-key')).toBe(
      'saved-key',
    );
  });

  it('uses the environment credential when environment is selected', () => {
    expect(chooseProviderApiKey('environment', 'saved-key', ' env-key ')).toBe(
      'env-key',
    );
  });

  it('does not fall back to a saved key when the selected environment is unset', () => {
    expect(chooseProviderApiKey('environment', 'saved-key', undefined)).toBe(
      undefined,
    );
  });

  it('does not fall back to an environment key when selected Settings has no key', () => {
    expect(chooseProviderApiKey('settings', undefined, 'env-key')).toBe(
      undefined,
    );
  });

  it('preserves saved-key-first behavior for legacy settings', () => {
    expect(chooseProviderApiKey(undefined, 'saved-key', 'env-key')).toBe(
      'saved-key',
    );
    expect(chooseProviderApiKey(undefined, undefined, 'env-key')).toBe(
      'env-key',
    );
  });
});
