/**
 * __tests__/opencode-setup-card.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The Settings card is the only place a user can install the OpenCode plugin.
 * Pin the version gate and the install/update affordances so a v1 OpenCode
 * install is never offered a v2-only plugin.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OpencodeSetupCard } from '@/components/settings/views/OpencodeSetupCard';

const mockUseOpencodeSetup = jest.fn();

jest.mock('@/hooks/use-opencode-setup', () => ({
  useOpencodeSetup: () => mockUseOpencodeSetup(),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const mockToast = jest.requireMock('sonner').toast as {
  success: jest.Mock;
  error: jest.Mock;
};

function setup(overrides: Record<string, unknown> = {}) {
  mockUseOpencodeSetup.mockReturnValue({
    detection: {
      state: 'connected',
      version: '2.0.18',
      binaryPath: '/home/me/.opencode/bin/opencode',
      serviceUrl: 'http://127.0.0.1:49374',
      message: 'OpenCode 2.0.18 is reachable.',
    },
    detecting: false,
    registeredPlugins: [],
    registering: false,
    error: null,
    detect: jest.fn(),
    registerPlugin: jest.fn(async () => ({
      ok: true,
      added: true,
      configPath: '/home/me/.config/opencode/opencode.jsonc',
      pluginEntry: 'file:///plugins/qeda-builder',
      message: 'installed',
    })),
    unregisterPlugin: jest.fn(),
    openInstallPage: jest.fn(),
    ...overrides,
  });
}

describe('OpencodeSetupCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setup();
  });

  it('registers the bundled plugin from a supported connection', async () => {
    const registerPlugin = jest.fn(async () => ({
      ok: true,
      added: true,
      configPath: '/config',
      pluginEntry: 'file:///plugins/qeda-builder',
      message: 'installed',
    }));
    setup({ registerPlugin });
    render(<OpencodeSetupCard />);

    fireEvent.click(screen.getByRole('button', { name: 'Register plugin' }));

    expect(registerPlugin).toHaveBeenCalledWith('bundled');
    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining('Restart OpenCode'),
      ),
    );
  });

  it('shows the registered state and re-register action', () => {
    setup({
      registeredPlugins: [
        'file:///home/me/.config/opencode/plugins/qeda-builder',
      ],
    });
    render(<OpencodeSetupCard />);
    expect(screen.getByText('registered · restart OpenCode')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Re-register' })).toBeVisible();
  });

  it('does not offer the v2 plugin for an unsupported install', () => {
    setup({
      detection: {
        state: 'installed-unsupported',
        version: '1.18.4',
        binaryPath: '/home/me/.opencode/bin/opencode',
        serviceUrl: null,
        message: 'OpenCode 1.18.4 is installed, but Builder requires 2.x.',
      },
    });
    render(<OpencodeSetupCard />);
    expect(
      screen.getByRole('button', { name: 'Get OpenCode 2.x' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Register plugin' }),
    ).not.toBeInTheDocument();
  });

  it('offers the download page when OpenCode is missing', () => {
    setup({
      detection: {
        state: 'not-installed',
        version: null,
        binaryPath: null,
        serviceUrl: null,
        message: 'OpenCode is not installed.',
      },
    });
    render(<OpencodeSetupCard />);
    expect(
      screen.getByRole('button', { name: 'OpenCode download page' }),
    ).toBeVisible();
  });
});
