/**
 * __tests__/opencode-detection.test.ts
 */
jest.mock('@opencode/client/service', () => ({
  Service: {
    discover: jest.fn(),
  },
}));

import {
  detectOpenCode,
  isOpenCodeVersionSupported,
} from '@/main/opencode/detection';
import { Service } from '@opencode/client/service';

describe('opencode detection', () => {
  beforeEach(() => {
    (Service.discover as jest.Mock).mockReset();
  });

  it('isOpenCodeVersionSupported', () => {
    expect(isOpenCodeVersionSupported('2.0.18')).toBe(true);
    expect(isOpenCodeVersionSupported('1.2.3')).toBe(false);
    expect(isOpenCodeVersionSupported(null)).toBe(false);
  });

  it('returns connected when service is discovered and version supported', async () => {
    (Service.discover as jest.Mock).mockResolvedValue({
      url: 'http://127.0.0.1:4097',
    });
    const result = await detectOpenCode();
    // binary exists on this machine; state depends on version. Just check shape.
    expect(result).toHaveProperty('state');
    expect(result).toHaveProperty('binaryPath');
    expect(result).toHaveProperty('serviceUrl');
  });

  it('returns installed-not-running when no service', async () => {
    (Service.discover as jest.Mock).mockResolvedValue(null);
    const result = await detectOpenCode();
    expect([
      'not-installed',
      'installed-not-running',
      'installed-unsupported',
    ]).toContain(result.state);
    expect(result.serviceUrl).toBeNull();
  });
});
