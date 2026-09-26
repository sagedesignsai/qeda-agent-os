import path from 'node:path';
import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { dependencies as nativeDependencies } from './release/app/package.json';

const root = __dirname;
const nativeModules = Object.keys(nativeDependencies || {});
// Use an array so electron-vite can merge these with its builtin externals.
const external = [
  'better-sqlite3',
  ...nativeModules.flatMap((name) => [
    name,
    new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
  ]),
];

export default defineConfig({
  main: {
    build: {
      outDir: 'release/app/dist/main',
      sourcemap: true,
      externalizeDeps: false,
      rollupOptions: {
        input: path.join(root, 'src/main/main.ts'),
        external,
        output: { entryFileNames: 'main.js' },
      },
    },
  },
  preload: {
    build: {
      outDir: 'release/app/dist/preload',
      sourcemap: true,
      externalizeDeps: false,
      rollupOptions: {
        input: path.join(root, 'src/main/preload.ts'),
        external,
        output: { entryFileNames: 'preload.js' },
      },
    },
  },
  renderer: {
    root: path.join(root, 'src/renderer'),
    base: './',
    plugins: [react({}), svgr(), tailwindcss()],
    resolve: {
      // Mirrors the `@/*` path alias in tsconfig.json (used by shadcn/ui).
      alias: {
        '@': path.join(root, 'src'),
      },
    },
    server: {
      host: 'localhost',
      port: Number(process.env.PORT || 1212),
      strictPort: true,
    },
    build: {
      outDir: path.join(root, 'release/app/dist/renderer'),
      emptyOutDir: true,
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        input: path.join(root, 'src/renderer/index.html'),
        output: { entryFileNames: 'renderer.js' },
        // shadcn/ui components ship a `'use client'` directive that is a no-op
        // outside of React Server Components.
        onwarn(warning, warn) {
          if (
            warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
            warning.message.includes('use client')
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
  },
});
