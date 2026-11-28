/**
 * __tests__/motion-world-popover.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The viewport world chip must read the DOCUMENT, not editor state: a solid
 * world reports its colour, an HDRI reports the asset, and a scene with no world
 * falls back to the editor tone label.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import { MotionWorldPopover } from '@/components/motion/MotionWorldPopover';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import type { MotionAsset, MotionDocument } from '@/lib/motion/types';

const NOW = '2026-01-01T00:00:00.000Z';

const HDR_ASSET: MotionAsset = {
  id: 'asset_studio_hdr',
  name: 'Studio HDRI',
  kind: 'environment',
  mimeType: 'image/vnd.radiance',
  path: 'assets/asset_studio_hdr/source.hdr',
  hash: '',
  byteSize: 2048,
  createdAt: NOW,
};

function withWorld(
  doc: MotionDocument,
  background: NonNullable<MotionDocument['scenes'][number]['background']>,
): MotionDocument {
  const sceneId = doc.activeSceneId;
  return {
    ...doc,
    scenes: doc.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, background } : scene,
    ),
  };
}

function renderChip(doc: MotionDocument) {
  render(
    <MotionWorldPopover doc={doc} stageTone="graphite" onStageToneChange={() => {}} />,
  );
  return screen.getByRole('button', { name: 'Scene background' });
}

describe('MotionWorldPopover', () => {
  it('falls back to the editor tone when the scene declares no world', () => {
    expect(renderChip(createStarterMotionDocument(NOW))).toHaveTextContent('Stage tone');
  });

  it('reports a solid document background', () => {
    const doc = withWorld(createStarterMotionDocument(NOW), {
      type: 'color',
      color: '#101820',
    });
    expect(renderChip(doc)).toHaveTextContent('Solid');
  });

  it('reports transparency', () => {
    const doc = withWorld(createStarterMotionDocument(NOW), { type: 'transparent' });
    expect(renderChip(doc)).toHaveTextContent('Transparent');
  });

  it('names the HDRI that lights the scene', () => {
    const base = createStarterMotionDocument(NOW);
    const doc = withWorld({ ...base, assets: [...base.assets, HDR_ASSET] }, {
      type: 'environment',
      assetId: HDR_ASSET.id,
      intensity: 1.2,
    });
    expect(renderChip(doc)).toHaveTextContent('Studio HDRI');
  });

  it('names the procedural studio rig without requiring an HDRI asset', () => {
    const doc = withWorld(createStarterMotionDocument(NOW), {
      type: 'studio',
      variant: 'softbox',
      color: '#e8e4dc',
    });
    expect(renderChip(doc)).toHaveTextContent('Studio · Softbox');
  });
});
