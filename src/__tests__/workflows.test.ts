/**
 * __tests__/workflows.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for Warp-inspired Parameterized Workflows (Pillar 4).
 * Verifies parameter extraction, default fallbacks, and command interpolation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  extractWorkflowParams,
  interpolateWorkflow,
  BUILTIN_WORKFLOWS,
} from '../lib/workflows';

describe('extractWorkflowParams', () => {
  it('extracts bare parameters without defaults', () => {
    const cmd = 'docker logs -f {{container_name}}';
    const params = extractWorkflowParams(cmd);
    expect(params).toEqual([
      { name: 'container_name', defaultValue: undefined },
    ]);
  });

  it('extracts parameters with defaults', () => {
    const cmd = 'lsof -ti:{{port:3000}} | xargs kill -9';
    const params = extractWorkflowParams(cmd);
    expect(params).toEqual([{ name: 'port', defaultValue: '3000' }]);
  });

  it('deduplicates parameters named multiple times', () => {
    const cmd = 'echo {{name:world}} and goodbye {{name:world}}';
    const params = extractWorkflowParams(cmd);
    expect(params).toHaveLength(1);
    expect(params[0].name).toBe('name');
  });

  it('handles multiple parameters with and without defaults', () => {
    const cmd =
      'git checkout -b {{branch}} origin/{{base:main}} --track {{remote:origin}}';
    const params = extractWorkflowParams(cmd);
    expect(params).toEqual([
      { name: 'branch', defaultValue: undefined },
      { name: 'base', defaultValue: 'main' },
      { name: 'remote', defaultValue: 'origin' },
    ]);
  });
});

describe('interpolateWorkflow', () => {
  it('substitutes user-supplied parameter values', () => {
    const cmd = 'lsof -ti:{{port:3000}} | xargs kill -9';
    const result = interpolateWorkflow(cmd, { port: '8080' });
    expect(result).toBe('lsof -ti:8080 | xargs kill -9');
  });

  it('falls back to default value when user input is empty or omitted', () => {
    const cmd = 'lsof -ti:{{port:3000}} | xargs kill -9';
    expect(interpolateWorkflow(cmd, {})).toBe('lsof -ti:3000 | xargs kill -9');
    expect(interpolateWorkflow(cmd, { port: '  ' })).toBe(
      'lsof -ti:3000 | xargs kill -9',
    );
  });

  it('falls back to empty string when no default exists and user input is omitted', () => {
    const cmd = 'docker stop {{container}}';
    expect(interpolateWorkflow(cmd, {})).toBe('docker stop ');
  });

  it('handles complex shell pipes with multiple replacements', () => {
    const cmd =
      'find {{dir:.}} -type f -name "{{pattern:*.log}}" -size +{{size:10M}}';
    const result = interpolateWorkflow(cmd, {
      dir: '/var/log',
      pattern: '*.err',
      size: '50M',
    });
    expect(result).toBe('find /var/log -type f -name "*.err" -size +50M');
  });
});

describe('BUILTIN_WORKFLOWS', () => {
  it('provides valid built-in workflows with required fields', () => {
    expect(BUILTIN_WORKFLOWS.length).toBeGreaterThan(5);
    for (const wf of BUILTIN_WORKFLOWS) {
      expect(wf.id).toBeTruthy();
      expect(wf.name).toBeTruthy();
      expect(wf.description).toBeTruthy();
      expect(wf.command).toBeTruthy();
      expect(wf.category).toMatch(/^(git|docker|system|ports|dev)$/);
    }
  });
});
