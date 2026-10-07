/**
 * .erb/mocks/shikiMock.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Jest cannot `require` shiki's ESM-only `dist/index.mjs`, and `code-block.tsx`
 * is pulled in transitively by any test that renders a tool card. This mock
 * keeps the highlighter surface (createHighlighter → getLoadedLanguages /
 * codeToTokens) but returns plain, unhighlighted lines. Highlighting is purely
 * cosmetic, so tests assert structure, not token colors.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const LOADED_LANGUAGES = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'css',
  'html',
  'bash',
  'shell',
  'markdown',
  'text',
];

function createHighlighter() {
  return Promise.resolve({
    getLoadedLanguages: () => LOADED_LANGUAGES,
    getLoadedThemes: () => ['github-light', 'github-dark'],
    codeToTokens: (code) => ({
      tokens: String(code)
        .split('\n')
        .map((line) =>
          line === '' ? [] : [{ color: 'inherit', content: line }],
        ),
      fg: 'inherit',
      bg: 'transparent',
    }),
  });
}

module.exports = { createHighlighter };
