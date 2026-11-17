/**
 * __tests__/motion-remote-assets-hook.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renderer side of the catalog: an import must use the provider carried by the
 * hit (the callbacks are memoized), and the catalog must not be queried at all
 * while the local library tab is showing.
 */

import { act, renderHook } from '@testing-library/react';

import { useMotionRemoteAssets } from '@/hooks/use-motion-remote-assets';
import type { MotionRemoteAssetHit } from '@/main/ipc/channels';

const sketchfabHit: MotionRemoteAssetHit = {
  provider: 'sketchfab',
  id: 'abc123',
  name: 'Sketchfab Thing',
  kind: 'model',
  license: 'CC0-1.0',
  pageUrl: 'https://sketchfab.com/3d-models/abc123',
};

const invoke = jest.fn();

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (channel: string) => {
    if (channel === 'motion:search-remote-assets') return { hits: [], total: 0, providerCredit: '' };
    if (channel === 'motion:import-remote-assets') return { items: [], errors: [], provenance: {} };
    if (channel === 'motion:commit-assets') return { assets: [], errors: [] };
    return undefined;
  });
  window.electron = {
    ipc: { invoke, on: jest.fn().mockReturnValue(() => {}) },
  } as unknown as typeof window.electron;
  // jsdom's crypto has no randomUUID; the hook mints one request id per import.
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => 'req-test' },
    configurable: true,
  });
});

const callsTo = (channel: string) => invoke.mock.calls.filter(([name]) => name === channel);

describe('useMotionRemoteAssets', () => {
  it('imports with the hit provider, not the provider captured at mount', async () => {
    const { result } = renderHook(() =>
      useMotionRemoteAssets('prj_test', { searchEnabled: false }),
    );

    act(() => result.current.setProvider('sketchfab'));
    await act(async () => {
      await result.current.importAsset(sketchfabHit, 'glb');
    });

    const [call] = callsTo('motion:import-remote-assets');
    expect(call?.[1]).toMatchObject({ provider: 'sketchfab', assetId: 'abc123', variantId: 'glb' });
  });

  it('does not query the catalog until search is enabled', async () => {
    jest.useFakeTimers();
    try {
      const { rerender } = renderHook(
        ({ enabled }: { enabled: boolean }) =>
          useMotionRemoteAssets('prj_test', { searchEnabled: enabled }),
        { initialProps: { enabled: false } },
      );

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(callsTo('motion:search-remote-assets')).toHaveLength(0);

      rerender({ enabled: true });
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(callsTo('motion:search-remote-assets')).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
