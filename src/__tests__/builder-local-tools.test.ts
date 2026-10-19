/**
 * __tests__/builder-local-tools.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The Local Builder's shell approval boundary. These tests exercise the real
 * tool `execute` against a real temp directory, because the thing that matters
 * is whether "Always allow" survives a prompt *and* stays scoped to the exact
 * command — a mocked permission callback would prove neither.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWorkspaceCodingTools } from '@/main/builder/tools/coding-tools';
import type { BuilderPermissionDecision } from '@/lib/builder-interactions';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'builder-local-tools-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function runShell(
  tools: ReturnType<typeof createWorkspaceCodingTools>,
  command: string,
): Promise<{
  success?: boolean;
  stdout?: string;
  error?: string;
  rejected?: boolean;
}> {
  const execute = (
    tools.runShellCommand as unknown as {
      execute: (
        input: { command: string },
        options: { toolCallId: string; messages: [] },
      ) => Promise<{
        success?: boolean;
        stdout?: string;
        error?: string;
        rejected?: boolean;
      }>;
    }
  ).execute;
  return execute({ command }, { toolCallId: 'call-1', messages: [] });
}

describe('Local Builder shell approvals', () => {
  it('reuses an Always allow for the exact command and asks again for a different one', async () => {
    const asked: string[] = [];
    const tools = createWorkspaceCodingTools({
      workspaceDirectory: dir,
      onFileChanged: () => undefined,
      requestPermission: async ({ details }) => {
        asked.push(String(details.command));
        return 'always';
      },
    });

    const first = await runShell(tools, 'printf first');
    expect(first.success).toBe(true);
    expect(first.stdout).toBe('first');
    expect(asked).toEqual(['printf first']);

    // Same exact command: no second card, even though this is a new tool call
    // from a later step.
    const second = await runShell(tools, 'printf first');
    expect(second.success).toBe(true);
    expect(asked).toEqual(['printf first']);

    // A different command is a different approval; "always" must not become a
    // blanket shell grant.
    const third = await runShell(tools, 'printf second');
    expect(third.success).toBe(true);
    expect(asked).toEqual(['printf first', 'printf second']);
  });

  it('does not remember Allow once', async () => {
    const asked: string[] = [];
    const tools = createWorkspaceCodingTools({
      workspaceDirectory: dir,
      onFileChanged: () => undefined,
      requestPermission: async ({ details }) => {
        asked.push(String(details.command));
        return 'once' as BuilderPermissionDecision;
      },
    });

    await runShell(tools, 'printf once');
    await runShell(tools, 'printf once');

    expect(asked).toEqual(['printf once', 'printf once']);
  });

  it('denies without executing when the user rejects', async () => {
    const tools = createWorkspaceCodingTools({
      workspaceDirectory: dir,
      onFileChanged: () => undefined,
      requestPermission: async () => 'reject' as BuilderPermissionDecision,
    });

    const result = await runShell(tools, 'touch should-not-exist');

    expect(result.rejected).toBe(true);
    expect(result.error).toMatch(/rejected/i);
    expect(fs.existsSync(path.join(dir, 'should-not-exist'))).toBe(false);
  });
});
