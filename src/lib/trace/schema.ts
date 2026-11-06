/**
 * lib/trace/schema.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Document version detection for Nova Trace.
 *
 * The document version (`schemaVersion`) is separate from the on-disk bundle
 * envelope version. A project file may be `format: 2` and still hold a
 * `schemaVersion: 1` document, because opening a v1 document does not write it
 * until the next save.
 *
 * A document from a newer build is refused rather than "repaired": silently
 * dropping fields a player does not understand is how documents get corrupted.
 */

import type { TraceDocument } from './types';

export const TRACE_SCHEMA_VERSION = 2 as const;
export const TRACE_SCHEMA_V1 = 1 as const;

export class TraceSchemaNewerError extends Error {
  readonly code = 'TRACE_SCHEMA_NEWER' as const;

  constructor(
    readonly found: number,
    readonly supported: number = TRACE_SCHEMA_VERSION,
  ) {
    super(
      `This Nova Trace project uses schema ${found}, but this build supports up to ${supported}. Update the app to open it.`,
    );
    this.name = 'TraceSchemaNewerError';
  }
}

export class TraceSchemaInvalidError extends Error {
  readonly code = 'TRACE_SCHEMA_INVALID' as const;

  constructor(message: string) {
    super(message);
    this.name = 'TraceSchemaInvalidError';
  }
}

/**
 * A missing or non-numeric `schemaVersion` means "v1": every document written
 * before the artboard split is a single-timeline v1 project.
 */
export function readTraceSchemaVersion(value: unknown): number {
  if (!value || typeof value !== 'object') return TRACE_SCHEMA_V1;
  const raw = (value as { schemaVersion?: unknown }).schemaVersion;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return TRACE_SCHEMA_V1;
  return Math.max(0, Math.floor(raw));
}

export function assertSupportedTraceSchema(value: unknown): void {
  const version = readTraceSchemaVersion(value);
  if (version > TRACE_SCHEMA_VERSION) throw new TraceSchemaNewerError(version);
}

/**
 * Structural check only. It answers "is this shaped like a v2 document?", not
 * "is this document valid?" — validity is the linter's job.
 */
export function isTraceDocument(value: unknown): value is TraceDocument {
  if (!value || typeof value !== 'object') return false;
  const document = value as Partial<TraceDocument>;
  if (document.schemaVersion !== TRACE_SCHEMA_VERSION) return false;
  if (!document.artboards || typeof document.artboards !== 'object') return false;
  if (typeof document.activeArtboardId !== 'string') return false;
  if (!Array.isArray(document.artboardOrder)) return false;
  return Object.keys(document.artboards).length > 0;
}

/**
 * The ids `migrateTraceDocument` gives the single artboard/animation of a v1
 * document. Shared with `defaults.ts` so a new document and a migrated one have
 * the same identity.
 */
export const TRACE_DEFAULT_ARTBOARD_ID = 'ab-default';
export const TRACE_DEFAULT_ANIMATION_ID = 'anim-default';
