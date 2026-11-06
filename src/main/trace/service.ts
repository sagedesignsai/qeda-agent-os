/**
 * main/trace/service.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Main-process composition root for Nova Trace persistence.
 *
 * Trace keeps its bundles under `userData/trace` and its own `trace_projects`
 * table, deliberately separate from `userData/motion` and `motion_projects`.
 */

import { app } from 'electron'
import path from 'node:path'

import { TraceProjectIndex } from './trace-project-index.js'
import { TraceProjectStore } from './trace-project-store.js'

let store: TraceProjectStore | null = null

export function getTraceProjectStore(): TraceProjectStore {
  if (!store) {
    const directory = path.join(app.getPath('userData'), 'trace')
    store = new TraceProjectStore(directory, new TraceProjectIndex())
  }
  return store
}
