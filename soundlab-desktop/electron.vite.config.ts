import path from 'node:path';
import { defineConfig } from 'electron-vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { dependencies as nativeDependencies } from './release/app/package.json';

const root = __dirname;
const nativeModules = Object.keys(nativeDependencies || {});
const external = [
  'better-sqlite3',
  ...nativeModules.flatMap((name) => [
    name,
    new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
  ]),
];

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@': path.join(root, 'src'),
      },
    },
    build: {
      outDir: 'release/app/dist/main',
      sourcemap: process.env.VITE_BUILD_SOURCEMAP !== 'false',
      externalizeDeps: false,
      rollupOptions: {
        input: path.join(root, 'src/main/main.ts'),
        external,
        output: { entryFileNames: 'main.js' },
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@': path.join(root, 'src'),
      },
    },
    build: {
      outDir: 'release/app/dist/preload',
      sourcemap: process.env.VITE_BUILD_SOURCEMAP !== 'false',
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
    plugins: [react({}), tailwindcss()],
    resolve: {
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
      sourcemap: process.env.VITE_BUILD_SOURCEMAP !== 'false',
      rollupOptions: {
        input: path.join(root, 'src/renderer/index.html'),
        output: {
          entryFileNames: () => 'renderer.js',
        },
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
