/**
 * main/motion/service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main-process composition root for Motion project persistence.
 */

import { app } from 'electron';
import path from 'node:path';

import { MotionProjectIndex } from './project-index.js';
import { MotionProjectStore } from './project-store.js';

let store: MotionProjectStore | null = null;

export function getMotionProjectStore(): MotionProjectStore {
  if (!store) {
    const directory = path.join(app.getPath('userData'), 'motion');
    store = new MotionProjectStore(directory, new MotionProjectIndex());
  }
  return store;
}
