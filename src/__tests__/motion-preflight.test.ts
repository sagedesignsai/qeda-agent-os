/**
 * __tests__/motion-preflight.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Keeps document-level export blockers and warnings deterministic and actionable.
 */

import { createBlankMotionDocument } from '@/lib/motion/defaults';
import { preflightMotionExport } from '@/lib/motion/export/preflight';

describe('preflightMotionExport', () => {
  it('accepts a valid scene and reports no issues', () => {
    const document = createBlankMotionDocument({ duration: 6 });
    expect(preflightMotionExport(document)).toEqual([]);
  });

  it('reports invalid output, range, unknown nodes, and absent referenced assets', () => {
    const document = createBlankMotionDocument({ duration: 6 });
    document.meta.output.width = 0;
    document.meta.output.fps = 25;
    document.scene.nodes.push({
      ...document.scene.nodes[0],
      id: 'node_unknown',
      name: 'Unknown renderer node',
      type: 'plugin.unknown',
      props: { nested: { assetId: 'asset_missing' } },
    });

    const issues = preflightMotionExport(document, { range: { start: 5, end: 7 } });
    expect(issues.map(({ code }) => code)).toEqual([
      'MOTION_OUTPUT_SIZE_INVALID',
      'MOTION_OUTPUT_FPS_INVALID',
      'MOTION_EXPORT_RANGE_INVALID',
      'MOTION_NODE_UNSUPPORTED',
      'MOTION_ASSET_MISSING',
    ]);
    expect(issues.find(({ code }) => code === 'MOTION_ASSET_MISSING')).toMatchObject({ assetId: 'asset_missing', severity: 'blocking' });
  });

  it('warns before exporting transparent content to MP4 and detects unavailable bundle media', () => {
    const document = createBlankMotionDocument();
    document.scenes[0].background = { type: 'transparent' };
    document.assets.push({
      id: 'asset_logo', name: 'Logo', kind: 'image', mimeType: 'image/png', path: 'assets/logo.png',
      hash: 'hash', byteSize: 1, createdAt: '2026-01-01T00:00:00.000Z',
    });
    document.scene.nodes.push({
      ...document.scene.nodes[0], id: 'node_logo', name: 'Logo', type: 'screen.image', props: { assetId: 'asset_logo' },
    });

    expect(preflightMotionExport(document, { container: 'mp4', availableAssetIds: new Set() })).toMatchObject([
      { severity: 'blocking', code: 'MOTION_ASSET_MISSING', assetId: 'asset_logo' },
      { severity: 'warning', code: 'MOTION_TRANSPARENCY_COMPOSITED' },
    ]);
  });
});
