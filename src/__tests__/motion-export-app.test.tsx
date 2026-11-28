/**
 * __tests__/motion-export-app.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The hidden export stage must use the document scene only: editor floor/grid,
 * selection, and gizmo props are absent even though the preview shares its graph.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import { MotionExportApp } from '@/components/motion/export/MotionExportApp';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import type { MotionRenderJobPayload } from '@/lib/motion/export/protocol';

jest.mock('@/components/motion/scene/MotionSceneCanvas', () => ({
  MotionSceneCanvas: (props: Record<string, unknown>) => (
    <div
      data-testid="export-scene-canvas"
      data-grid-visible={String(props.gridVisible)}
      data-editor-stage={String(props.showEditorStage)}
      data-selected-node={String(props.selectedNodeId ?? '')}
      data-preserve-buffer={String(props.preserveDrawingBuffer)}
      data-view-mode={String(props.viewMode)}
    />
  ),
}));

const job: MotionRenderJobPayload = {
  jobId: 'render_test',
  document: createStarterMotionDocument('2026-01-01T00:00:00.000Z'),
  settings: {
    width: 320,
    height: 180,
    fps: 30,
    bitrate: 900_000,
    extension: '.mp4',
    container: 'mp4',
    codecs: ['avc'],
  },
  range: { start: 0, end: 0.4 },
  frameCount: 12,
};

describe('MotionExportApp stage', () => {
  it('renders clean document-only frames without editor overlays', () => {
    render(<MotionExportApp job={job} />);
    // A single-scene export mounts one canvas; the second slot is reserved for
    // sequence transitions and would otherwise duplicate GPU memory and work.
    const canvases = screen.getAllByTestId('export-scene-canvas');
    expect(canvases).toHaveLength(1);
    for (const canvas of canvases) {
      expect(canvas).toHaveAttribute('data-grid-visible', 'false');
      expect(canvas).toHaveAttribute('data-editor-stage', 'false');
      expect(canvas).toHaveAttribute('data-selected-node', '');
      expect(canvas).toHaveAttribute('data-preserve-buffer', 'true');
      expect(canvas).toHaveAttribute('data-view-mode', 'cinematic');
    }
  });

  it('mounts both canvases for a multi-shot sequence export', () => {
    const document = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    const secondScene = { ...document.scenes[0], id: 'scene_two', name: 'Scene 2' };
    const sequenceJob: MotionRenderJobPayload = {
      ...job,
      document: {
        ...document,
        scenes: [...document.scenes, secondScene],
        sequence: {
          duration: 12,
          items: [
            { id: 'shot_1', sceneId: document.scenes[0].id, start: 0, duration: 6 },
            { id: 'shot_2', sceneId: secondScene.id, start: 6, duration: 6 },
          ],
        },
      },
      range: { start: 0, end: 12, sequence: true },
      frameCount: 360,
    };

    render(<MotionExportApp job={sequenceJob} />);
    expect(screen.getAllByTestId('export-scene-canvas')).toHaveLength(2);
  });
});
