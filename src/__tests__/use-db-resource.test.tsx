/**
 * __tests__/use-db-resource.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Inline selectors are normal hook usage; their identity must not retrigger the
 * initial resource load after every state update.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useDbResource } from '../hooks/use-db-resource';

beforeEach(() => {
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      ipc: {
        invoke: jest.fn().mockResolvedValue([{ id: 'contact-1' }]),
        on: jest.fn(() => () => {}),
      },
    },
  });
});

it('does not refetch on each render when the selector is inline', async () => {
  const { result } = renderHook(() =>
    useDbResource<Array<{ id: string }>>({
      channel: 'correspondence:contacts-list',
      event: 'correspondence:changed',
      select: (raw) => (Array.isArray(raw) ? raw : []),
    }),
  );

  await waitFor(() =>
    expect(result.current.data).toEqual([{ id: 'contact-1' }]),
  );
  expect(window.electron.ipc.invoke).toHaveBeenCalledTimes(1);
});
