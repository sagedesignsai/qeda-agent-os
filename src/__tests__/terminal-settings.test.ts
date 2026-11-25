import {
  DEFAULT_TERMINAL_SETTINGS,
  mergeTerminalSettings,
  normalizeTerminalSettings,
} from '../lib/terminal-settings';

describe('terminal settings', () => {
  it('keeps bounded terminal preferences and trims configured executable paths', () => {
    expect(
      normalizeTerminalSettings({
        shellPath: ' /bin/zsh ',
        preferredCodingCli: 'cline',
        codingCliPaths: { opencode: ' /opt/tools/opencode ' },
        commandTimeoutMs: 120_000,
        maxAgentSteps: 40,
        scrollbackLines: 20_000,
        ptyReplayBufferBytes: 512_000,
        fontSize: 18,
        historyLimit: 1_000,
        autoRouteInteractiveCommandsToPty: false,
        shellIntegration: false,
      }),
    ).toEqual({
      shellPath: '/bin/zsh',
      preferredCodingCli: 'cline',
      codingCliPaths: { opencode: '/opt/tools/opencode' },
      commandTimeoutMs: 120_000,
      maxAgentSteps: 40,
      scrollbackLines: 20_000,
      ptyReplayBufferBytes: 512_000,
      fontSize: 18,
      historyLimit: 1_000,
      autoRouteInteractiveCommandsToPty: false,
      shellIntegration: false,
    });
  });

  it('falls back to safe defaults for unsupported values and control characters', () => {
    expect(
      normalizeTerminalSettings({
        shellPath: '/bin/bash\nmalicious',
        commandTimeoutMs: 999_999,
        maxAgentSteps: 1,
        scrollbackLines: -1,
        codingCliPaths: { cline: 'bad\rpath' },
      }),
    ).toEqual(DEFAULT_TERMINAL_SETTINGS);
  });

  it('merges partial updates while allowing executable overrides to be cleared', () => {
    const current = normalizeTerminalSettings({
      preferredCodingCli: 'cline',
      codingCliPaths: { cline: '/opt/cline', opencode: '/opt/opencode' },
      fontSize: 16,
    });

    expect(
      mergeTerminalSettings(current, {
        codingCliPaths: { cline: '/custom/cline' },
      }),
    ).toMatchObject({
      preferredCodingCli: 'cline',
      codingCliPaths: { cline: '/custom/cline' },
      fontSize: 16,
    });
    expect(
      mergeTerminalSettings(current, { codingCliPaths: {} }).codingCliPaths,
    ).toEqual({});
  });
});
