/**
 * main/trace/trace-surface-store.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistence for generated Trace surfaces.
 *
 * Every proposal the Surface Specialist completes is saved here as a
 * self-contained record (prompt + compiled fragment + thumbnail). The record is
 * enough to re-preview and re-insert the surface into any project later, so a
 * generated backdrop survives restarts even when it was never inserted.
 *
 * File layout mirrors the project store: one JSON bundle per surface under
 * `userData/trace/surfaces`, newest-first listing, bounded history.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  SurfaceGenerationProposal,
} from '../../lib/trace/addons/surfaces/generation';

export interface TraceSurfaceRecord {
  id: string;
  createdAt: string;
  prompt: string;
  proposal: SurfaceGenerationProposal;
}

export interface TraceSurfaceSummary {
  id: string;
  createdAt: string;
  prompt: string;
  summary: string;
  width: number;
  height: number;
  durationMs: number;
  loop: boolean;
  elementCount: number;
  trackCount: number;
  thumbnailSvg: string;
}

/** History cap: generated surfaces are cheap but unbounded growth is not. */
const MAX_SURFACES = 40;

const SURFACE_ID_PATTERN = /^surf_[a-f0-9]{16}$/;

function summarize(record: TraceSurfaceRecord): TraceSurfaceSummary {
  const { proposal } = record;
  return {
    id: record.id,
    createdAt: record.createdAt,
    prompt: record.prompt,
    summary: proposal.summary,
    width: proposal.width,
    height: proposal.height,
    durationMs: proposal.durationMs,
    loop: proposal.loop,
    elementCount: Object.keys(proposal.fragment.elements).length,
    trackCount: proposal.tracks.length,
    thumbnailSvg: proposal.previewSvg,
  };
}

function assertSafeSurfaceId(id: string): void {
  if (!SURFACE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid surface id "${id}".`);
  }
}

export class TraceSurfaceStore {
  constructor(
    private readonly directory: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private pathFor(id: string): string {
    assertSafeSurfaceId(id);
    return path.join(this.directory, `${id}.json`);
  }

  async save(input: {
    prompt: string;
    proposal: SurfaceGenerationProposal;
  }): Promise<TraceSurfaceSummary> {
    await mkdir(this.directory, { recursive: true });
    const id = `surf_${randomBytes(8).toString('hex')}`;
    const record: TraceSurfaceRecord = {
      id,
      createdAt: this.now().toISOString(),
      prompt: input.prompt.slice(0, 800),
      proposal: input.proposal,
    };
    await writeFile(
      this.pathFor(id),
      JSON.stringify(record),
      'utf8',
    );
    await this.pruneOldRecords();
    return summarize(record);
  }

  async list(limit = 24): Promise<TraceSurfaceSummary[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(this.directory);
    } catch {
      return [];
    }
    const records: TraceSurfaceRecord[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await readFile(
          path.join(this.directory, entry),
          'utf8',
        );
        const record = JSON.parse(raw) as TraceSurfaceRecord;
        if (record?.id && record?.proposal?.fragment) records.push(record);
      } catch {
        // A corrupt record is skipped, never fatal to the listing.
      }
    }
    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return records.slice(0, Math.max(1, limit)).map(summarize);
  }

  async load(id: string): Promise<TraceSurfaceRecord | null> {
    assertSafeSurfaceId(id);
    try {
      const raw = await readFile(this.pathFor(id), 'utf8');
      const record = JSON.parse(raw) as TraceSurfaceRecord;
      return record?.proposal?.fragment ? record : null;
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    assertSafeSurfaceId(id);
    try {
      await rm(this.pathFor(id), { force: true });
      return true;
    } catch {
      return false;
    }
  }

  private async pruneOldRecords(): Promise<void> {
    try {
      const entries = (await readdir(this.directory)).filter((entry) =>
        entry.endsWith('.json'),
      );
      if (entries.length <= MAX_SURFACES) return;
      const records: Array<{ file: string; createdAt: string }> = [];
      for (const entry of entries) {
        try {
          const raw = await readFile(
            path.join(this.directory, entry),
            'utf8',
          );
          const record = JSON.parse(raw) as TraceSurfaceRecord;
          records.push({
            file: entry,
            createdAt: record?.createdAt ?? '',
          });
        } catch {
          records.push({ file: entry, createdAt: '' });
        }
      }
      records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const excess = records.slice(0, Math.max(0, records.length - MAX_SURFACES));
      await Promise.all(
        excess.map((entry) =>
          rm(path.join(this.directory, entry.file), { force: true }).catch(
            () => undefined,
          ),
        ),
      );
    } catch {
      // Pruning is best-effort.
    }
  }
}