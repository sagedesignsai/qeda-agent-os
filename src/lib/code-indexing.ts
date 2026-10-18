/**
 * lib/code-indexing.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Conservative path allow/deny rules for semantic source indexing. Keep this
 * policy pure so ignored and secret-looking paths can be tested without Git or
 * an embeddings provider.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'node:path';

const CODE_FILE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.jsx',
  '.json',
  '.kt',
  '.lua',
  '.md',
  '.mjs',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svelte',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
  '.mdx',
  '.txt',
  '.ipynb',
]);

const IGNORED_CODE_DIRS = new Set([
  '.aws',
  '.git',
  '.next',
  '.nuxt',
  '.ssh',
  '.terraform',
  '.turbo',
  '.venv',
  'build',
  'certs',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'secrets',
  'target',
  'vendor',
]);

export function isIndexableCodePath(filePath: string): boolean {
  const parts = filePath.split(/[\\/]/);
  const base = parts.at(-1)?.toLowerCase() ?? '';
  if (parts.some((part) => IGNORED_CODE_DIRS.has(part.toLowerCase()))) {
    return false;
  }
  if (
    base.startsWith('.env') ||
    /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|cargo\.lock|poetry\.lock)$/.test(
      base,
    ) ||
    base.endsWith('.lock') ||
    /(secret|credential|private[-_.]?key|token|service[-_.]?account|id_rsa|id_ed25519)/i.test(
      base,
    ) ||
    /\.(pem|p12|pfx|key|crt|cer|der)$/i.test(base) ||
    base.endsWith('.min.js') ||
    base.endsWith('.min.css')
  ) {
    return false;
  }
  const extension = path.extname(base);
  return (
    CODE_FILE_EXTENSIONS.has(extension) ||
    ['dockerfile', 'makefile', 'readme', 'license'].includes(base)
  );
}
