/**
 * main/studio-draft.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Autonomous Magic Draft processing for a Studio take: kinetic zooms from
 * mouse telemetry, project-aware title, sample captions, styling defaults.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app, screen } from 'electron';
import { nanoid } from 'nanoid';
import {
  getStudioTake,
  saveStudioTake,
  type StudioTake,
  type StudioZoom,
  type StudioCaption,
} from './db/studio-store.js';
import { getProject } from './db/projects.js';

export async function processStudioDraft(takeId: string): Promise<StudioTake> {
  const take = getStudioTake(takeId);
  if (!take) throw new Error(`Take ${takeId} not found`);

  let mouseEvents: any[] = [];
  try {
    const eventsPath =
      take.mouseEventsPath ||
      path.join(app.getPath('userData'), 'studio', takeId, 'mouse_events.json');
    const data = await fs.readFile(eventsPath, 'utf-8');
    mouseEvents = JSON.parse(data);
  } catch {
    // Fallback if no mouse log
  }

  const zooms: StudioZoom[] = [];
  const durationMs = Math.max(take.durationMs, 4000);

  if (mouseEvents.length > 10) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const screenW = primaryDisplay.bounds.width || 1920;
    const screenH = primaryDisplay.bounds.height || 1080;

    const windowSizeMs = 1800;
    const windowStrideMs = windowSizeMs + 1200;
    const buckets = new Map<number, { count: number; x: number; y: number }>();
    for (const event of mouseEvents) {
      const bucket = Math.floor(event.t / windowStrideMs);
      const offset = event.t - bucket * windowStrideMs;
      if (offset < 0 || offset >= windowSizeMs) continue;
      const aggregate = buckets.get(bucket) ?? { count: 0, x: 0, y: 0 };
      aggregate.count++;
      aggregate.x += event.x;
      aggregate.y += event.y;
      buckets.set(bucket, aggregate);
    }

    for (
      let windowIndex = 0;
      windowIndex * windowStrideMs < durationMs - 1500;
      windowIndex++
    ) {
      const windowStart = windowIndex * windowStrideMs;
      const aggregate = buckets.get(windowIndex);
      if (aggregate && aggregate.count > 5) {
        const avgX = aggregate.x / aggregate.count;
        const avgY = aggregate.y / aggregate.count;
        const normX = Math.min(Math.max(avgX / screenW, 0.15), 0.85);
        const normY = Math.min(Math.max(avgY / screenH, 0.15), 0.85);
        zooms.push({
          id: nanoid(),
          startMs: windowStart + 300,
          endMs: windowStart + windowSizeMs - 200,
          targetX: Number(normX.toFixed(3)),
          targetY: Number(normY.toFixed(3)),
          scale: 1.5,
        });
      }
    }
  } else {
    zooms.push({
      id: nanoid(),
      startMs: 1000,
      endMs: Math.min(durationMs - 500, 3500),
      targetX: 0.5,
      targetY: 0.45,
      scale: 1.45,
    });
  }

  let projectContextName: string | undefined;
  let projectDesc: string | undefined;
  if (take.projectId) {
    const project = getProject(take.projectId);
    if (project) {
      projectContextName = project.name;
      projectDesc = project.description || '';
    }
  }

  const generatedTitle = projectContextName
    ? `${projectContextName} — Feature Walkthrough`
    : take.title || 'Interactive Project Demo';

  const captions: StudioCaption[] =
    take.captions.length > 0
      ? take.captions
      : [
          {
            id: nanoid(),
            startMs: 500,
            endMs: Math.min(durationMs, 3000),
            text: projectDesc
              ? `Demonstrating ${projectContextName}: ${projectDesc.slice(0, 50)}`
              : 'Showcasing latest feature build and workflow',
            words: [
              { word: 'Showcasing', startMs: 500, endMs: 1100 },
              { word: 'latest', startMs: 1150, endMs: 1600 },
              { word: 'feature', startMs: 1650, endMs: 2200 },
              { word: 'workflow', startMs: 2250, endMs: 2900 },
            ],
          },
        ];

  const updated = saveStudioTake({
    id: take.id,
    title: generatedTitle,
    zooms,
    captions,
    styling: {
      ...take.styling,
      zoomIntensity: 1.5,
      cameraEasing: 'smooth',
      showCaptions: true,
    },
  });

  return updated;
}
