/**
 * __tests__/notebook-prompt.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * The notebook prompt is the contract between the dialog and the agent: it
 * must name the tools the agent has to call and carry the topic, audience and
 * scope through. These tests pin that contract.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { buildNotebookPrompt, DEPTH_SCOPE } from '../lib/notebook-prompt';

describe('buildNotebookPrompt', () => {
  it('includes the topic and the standard scope by default', () => {
    const prompt = buildNotebookPrompt({ topic: 'the Jules API' });
    expect(prompt).toContain('Topic: the Jules API');
    expect(prompt).toContain(DEPTH_SCOPE.standard);
  });

  it('names the tools the agent must use to build a notebook', () => {
    const prompt = buildNotebookPrompt({ topic: 'Godot 2.5D platformer' });
    for (const tool of [
      'startResearchRun',
      'webSearch',
      'fetchUrl',
      'advancedSearch',
      'scrapePage',
      'libraryDocs',
      'findImages',
      'recordSource',
      'recordEvidence',
      'createNotebook',
      'writeNotebook',
      'completeResearchRun',
    ]) {
      expect(prompt).toContain(tool);
    }
  });

  it('requires per-section docs lookups and embedded imagery', () => {
    const prompt = buildNotebookPrompt({ topic: 'Godot 2.5D platformer' });
    expect(prompt).toMatch(/libraryDocs/);
    expect(prompt).toMatch(/findImages/);
    expect(prompt).toContain('![short alt text](image url)');
  });

  it('requires an overview with nested sections and a Sources page', () => {
    const prompt = buildNotebookPrompt({ topic: 'anything' });
    expect(prompt).toContain('overview');
    expect(prompt.toLowerCase()).toContain('nested');
    expect(prompt).toContain('"Sources"');
    expect(prompt).toContain('[[Section Title]]');
  });

  it('omits the audience line when none is given and includes it when present', () => {
    expect(buildNotebookPrompt({ topic: 'x' })).not.toContain('Intended reader:');
    const withAudience = buildNotebookPrompt({ topic: 'x', audience: 'beginners' });
    expect(withAudience).toContain('Intended reader: beginners');
  });

  it('uses the scope paragraph matching the requested depth', () => {
    for (const depth of ['quick', 'standard', 'deep'] as const) {
      const prompt = buildNotebookPrompt({ topic: 'x', depth });
      expect(prompt).toContain(DEPTH_SCOPE[depth]);
    }
    expect(DEPTH_SCOPE.quick).not.toEqual(DEPTH_SCOPE.deep);
  });

  it('trims the topic', () => {
    const prompt = buildNotebookPrompt({ topic: '  spaced topic  ' });
    expect(prompt).toContain('Topic: spaced topic');
    expect(prompt).not.toContain('Topic:   ');
  });
});
