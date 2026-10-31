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
    const canvas = screen.getByTestId('export-scene-canvas');
    expect(canvas).toHaveAttribute('data-grid-visible', 'false');
    expect(canvas).toHaveAttribute('data-editor-stage', 'false');
    expect(canvas).toHaveAttribute('data-selected-node', '');
    expect(canvas).toHaveAttribute('data-preserve-buffer', 'true');
    expect(canvas).toHaveAttribute('data-view-mode', 'perspective');
  });
});
