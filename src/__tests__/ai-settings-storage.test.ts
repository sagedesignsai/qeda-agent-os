import { saveSettings } from '../main/ai/settings';

describe('AI settings credential storage', () => {
  it('refuses to write credentials when OS secure storage is unavailable', () => {
    expect(() =>
      saveSettings({
        activeProvider: 'groq',
        activeModel: 'test-model',
        providers: { groq: { apiKey: 'secret-key' } },
      }),
    ).toThrow(/OS secure storage is unavailable/);
  });
});
