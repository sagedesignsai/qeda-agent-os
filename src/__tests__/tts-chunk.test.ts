/**
 * __tests__/tts-chunk.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Long-form splitting is the difference between a 6 000-character script
 * working and a provider rejecting the request halfway through. These tests
 * pin the boundaries that matter: never exceed the limit, never split an IPA
 * marker, and never rewrite a word the user already annotated.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  applyPronunciations,
  chunkText,
} from '../main/tts/chunk';

const words = (text: string): number =>
  text.split(/\s+/).filter(Boolean).length;

describe('chunkText', () => {
  it('keeps every chunk under the limit and loses no words', () => {
    const paragraph =
      'The quick brown fox jumps over the lazy dog while the sun sets. ';
    const text = paragraph.repeat(120);
    const chunks = chunkText(text, 1_900);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1_900);
    }
    expect(chunks.map((chunk) => chunk.text).join(' ')).toContain(
      'The quick brown fox jumps over the lazy dog',
    );
    expect(words(chunks.map((chunk) => chunk.text).join(' '))).toBe(
      words(text),
    );
  });

  it('prefers paragraph breaks over a hard cut', () => {
    const text = `${'a'.repeat(15)}\n\n${'b'.repeat(15)}`;
    const chunks = chunkText(text, 20);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.text).toBe('a'.repeat(15));
    expect(chunks[1]!.text).toBe('b'.repeat(15));
  });

  it('does not split an escaped pronunciation marker', () => {
    const marker = String.raw`\{"word":"Qeda","pronounce":"ˈkeɪdə"\}`;
    const text = `intro ${marker} outro`;
    const chunks = chunkText(text, 10);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.text).join(' ')).toContain(marker);
    // No chunk may hold only a fragment of the marker.
    for (const chunk of chunks) {
      if (chunk.text.includes('\\{')) {
        expect(chunk.text).toContain('\\}');
      }
    }
  });

  it('normalizes CRLF and ignores empty input', () => {
    expect(chunkText('a\r\nb', 100)).toHaveLength(1);
    expect(chunkText('   \n\n  ', 100)).toEqual([]);
  });
});

describe('applyPronunciations', () => {
  it('replaces whole words only and reports the count', () => {
    const result = applyPronunciations('Qeda builds Qedaware tools.', [
      { word: 'Qeda', ipa: 'ˈkeɪdə' },
    ]);

    expect(result.applied).toBe(1);
    expect(result.text).toContain(String.raw`\{"word":"Qeda","pronounce":"ˈkeɪdə"\}`);
    expect(result.text).toContain('Qedaware');
  });

  it('skips text already inside a marker', () => {
    const original = String.raw`\{"word":"Qeda","pronounce":"ˈkeɪdə"\}`;
    const result = applyPronunciations(`${original} and Qeda`, [
      { word: 'Qeda', ipa: 'ˈkeɪdə' },
    ]);

    expect(result.text).toContain(original);
    expect(result.text.match(/pronounce/g)).toHaveLength(2);
    expect(result.applied).toBe(1);
  });

  it('drops invalid entries instead of failing the request', () => {
    const result = applyPronunciations('hello', [
      { word: '', ipa: 'x' },
      { word: 'hello', ipa: 'x'.repeat(129) },
    ]);
    expect(result.text).toBe('hello');
    expect(result.applied).toBe(0);
    expect(result.warnings[0]).toContain('PRONUNCIATION_TOO_LONG');
  });
});
