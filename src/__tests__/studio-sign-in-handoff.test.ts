jest.mock('ai', () => ({
  tool: jest.fn((config: unknown) => config),
}));

jest.mock('../main/browser-use', () => ({
  focusBrowser: jest.fn(),
}));

jest.mock('../main/studio-recorder', () => ({
  hasActiveStudioRecording: jest.fn(() => false),
}));

import { focusBrowser } from '../main/browser-use';
import { hasActiveStudioRecording } from '../main/studio-recorder';
import { StudioSignInHandoff } from '../main/studio-sign-in-handoff';
import { createStudioSignInTool } from '../main/tools/studio-sign-in';

describe('StudioSignInHandoff', () => {
  it('resolves only after the user confirms or cancels', async () => {
    const sendRequest = jest.fn();
    const handoff = new StudioSignInHandoff({
      sendRequest,
      sendExpired: jest.fn(),
      now: () => 1_000,
      createId: () => 'request-1',
    });

    let settled = false;
    const pending = handoff.request('browser-1').then((outcome) => {
      settled = true;
      return outcome;
    });

    expect(settled).toBe(false);
    expect(sendRequest).toHaveBeenCalledWith({
      requestId: 'request-1',
      browserId: 'browser-1',
      expiresAt: 301_000,
    });
    expect(handoff.reply('request-1', 'continue')).toEqual({
      accepted: true,
    });
    await expect(pending).resolves.toBe('confirmed');
    expect(handoff.reply('request-1', 'cancel')).toEqual({
      accepted: false,
    });
  });

  it('cancels pending handoffs when the Studio window closes', async () => {
    const handoff = new StudioSignInHandoff({
      sendRequest: jest.fn(),
      sendExpired: jest.fn(),
      createId: () => 'request-close',
    });

    const pending = handoff.request('browser-1');
    handoff.cancelAll();

    await expect(pending).resolves.toBe('cancelled');
  });

  it('expires stale confirmations and notifies the renderer', async () => {
    jest.useFakeTimers();
    const sendExpired = jest.fn();
    const handoff = new StudioSignInHandoff({
      sendRequest: jest.fn(),
      sendExpired,
      timeoutMs: 100,
      createId: () => 'request-expire',
    });

    const pending = handoff.request('browser-1');
    jest.advanceTimersByTime(100);

    await expect(pending).resolves.toBe('expired');
    expect(sendExpired).toHaveBeenCalledWith('request-expire');
    jest.useRealTimers();
  });
});

describe('requestUserSignIn tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (hasActiveStudioRecording as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('focuses the browser before and after explicit confirmation', async () => {
    const request = jest.fn().mockResolvedValue('confirmed');
    const result = await (
      createStudioSignInTool(request) as unknown as {
        execute: (
          input: { browserId: string },
          options: unknown,
        ) => Promise<Record<string, unknown>>;
      }
    ).execute({ browserId: 'browser-2' }, {});

    expect(request).toHaveBeenCalledWith('browser-2');
    expect(focusBrowser).toHaveBeenNthCalledWith(1, 'browser-2');
    expect(focusBrowser).toHaveBeenNthCalledWith(2, 'browser-2');
    expect(result).toMatchObject({
      success: true,
      confirmed: true,
      browserId: 'browser-2',
    });
  });

  it('does not request confirmation while recording is active', async () => {
    (hasActiveStudioRecording as jest.Mock).mockReturnValue(true);
    const request = jest.fn();
    const result = await (
      createStudioSignInTool(request) as unknown as {
        execute: (
          input: { browserId: string },
          options: unknown,
        ) => Promise<Record<string, unknown>>;
      }
    ).execute({ browserId: 'browser-2' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Stop the demo recording/);
    expect(request).not.toHaveBeenCalled();
    expect(focusBrowser).not.toHaveBeenCalled();
  });

  it('returns a non-success result when the user cancels or the request expires', async () => {
    type ExecuteFn = (
      input: { browserId: string },
      options: unknown,
    ) => Promise<Record<string, unknown>>;
    const cancelTool = createStudioSignInTool(
      jest.fn().mockResolvedValue('cancelled'),
    ) as unknown as { execute: ExecuteFn };
    const expiredTool = createStudioSignInTool(
      jest.fn().mockResolvedValue('expired'),
    ) as unknown as { execute: ExecuteFn };

    await expect(
      cancelTool.execute({ browserId: 'browser-2' }, {}),
    ).resolves.toMatchObject({ success: false, cancelled: true });
    await expect(
      expiredTool.execute({ browserId: 'browser-2' }, {}),
    ).resolves.toMatchObject({ success: false, expired: true });
  });
});
