import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CODING_CLI_PROFILES,
  discoverCodingClis,
  resolveExecutable,
} from '../main/pty/coding-cli';

describe('coding CLI executable discovery', () => {
  let directory: string;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qeda-cli-'));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('resolves an executable from the supplied login-shell PATH', () => {
    const executable = path.join(directory, 'opencode');
    fs.writeFileSync(executable, '#!/bin/sh\n');
    fs.chmodSync(executable, 0o755);

    expect(resolveExecutable('opencode', { PATH: directory })).toBe(
      executable,
    );
    expect(resolveExecutable('cline', { PATH: directory })).toBeNull();
  });

  it('discovers configured ACP providers by their documented executable names', () => {
    const expected = Object.fromEntries(
      Object.entries(CODING_CLI_PROFILES).map(([provider, profile]) => {
        const executable = path.join(directory, profile.executable);
        fs.writeFileSync(executable, '#!/bin/sh\n');
        fs.chmodSync(executable, 0o755);
        return [provider, executable];
      }),
    );

    expect(discoverCodingClis({ PATH: directory })).toEqual(expected);
  });

  it('accepts an explicit absolute executable path', () => {
    const executable = path.join(directory, 'custom-agent');
    fs.writeFileSync(executable, '');
    fs.chmodSync(executable, 0o755);

    expect(resolveExecutable(executable, { PATH: '' })).toBe(executable);
  });

  it('uses a configured executable path for the selected provider', () => {
    const executable = path.join(directory, 'custom-opencode');
    fs.writeFileSync(executable, '');
    fs.chmodSync(executable, 0o755);

    expect(
      discoverCodingClis(
        { PATH: directory },
        { opencode: executable },
      ).opencode,
    ).toBe(executable);
  });
});
