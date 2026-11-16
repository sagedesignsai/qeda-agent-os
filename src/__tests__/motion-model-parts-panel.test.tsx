/**
 * __tests__/motion-model-parts-panel.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * `asset.metadata` is shared between parsed glTF structure and remote-import
 * provenance, so a model node routinely has metadata without `parts`. Selecting
 * it must render the empty state instead of throwing.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { ModelPartsPanel } from '@/components/motion/inspector/ModelPartsPanel';
import { MotionInspector } from '@/components/motion/MotionInspector';
import { motionStore } from '@/hooks/use-motion-store';
import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { createMotionNode } from '@/lib/motion/node-registry';
import type { MotionAsset, MotionDocument } from '@/lib/motion/types';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverMock,
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => undefined,
  });
});

const ASSET_ID = 'asset_model_provenance';

function documentWithModel(metadata: Record<string, unknown>): MotionDocument {
  const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
  const asset: MotionAsset = {
    id: ASSET_ID,
    name: 'model.glb',
    kind: 'model',
    mimeType: 'model/gltf-binary',
    path: `assets/${ASSET_ID}/model.glb`,
    hash: 'a'.repeat(64),
    byteSize: 1024,
    createdAt: '2026-01-01T00:00:00.000Z',
    metadata,
  };
  const node = createMotionNode('model.gltf', 'imported-model', { name: 'Imported model' });
  node.props = { ...node.props, assetId: ASSET_ID, missingAsset: false };
  return {
    ...doc,
    assets: [...doc.assets, asset],
    scene: { ...doc.scene, nodes: [...doc.scene.nodes, node] },
  };
}

beforeEach(() => {
  motionStore.setAutoKeyEnabled(false);
});

describe('ModelPartsPanel metadata handling', () => {
  it('renders the empty state when metadata only holds import provenance', () => {
    motionStore.loadDocument(
      documentWithModel({ provider: 'sketchfab', upstreamId: 'abc123', license: 'cc-by' }),
    );
    motionStore.setSelection({ kind: 'node', nodeId: 'imported-model' });

    render(<MotionInspector />);
    fireEvent.click(screen.getByRole('button', { name: /Specific Node Controls/ }));

    expect(screen.getByText('No parts detected')).toBeInTheDocument();
  });

  it('renders parts when metadata is only partially parsed', () => {
    motionStore.loadDocument(
      documentWithModel({
        parts: [{ name: 'Body', type: 'mesh', materialName: 'Paint' }],
        // Older writes and partial parses can omit materials entirely.
      } as unknown as Record<string, unknown>),
    );
    motionStore.setSelection({ kind: 'node', nodeId: 'imported-model' });

    render(<MotionInspector />);
    fireEvent.click(screen.getByRole('button', { name: /Specific Node Controls/ }));

    expect(screen.getByText('Parts (1)')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.queryByText(/^Materials \(/)).not.toBeInTheDocument();
  });
});

describe('ModelPartsPanel prop contract', () => {
  it('tolerates provenance-only metadata handed straight to the panel', () => {
    const doc = documentWithModel({ provider: 'sketchfab' });
    const node = doc.scene.nodes.find((candidate) => candidate.id === 'imported-model')!;

    render(
      <ModelPartsPanel
        node={node}
        assets={doc.assets}
        // The panel is the last line of defense: callers read a free-form
        // `Record<string, unknown>`, so this is the shape it actually receives.
        metadata={{ provider: 'sketchfab' } as unknown as Parameters<typeof ModelPartsPanel>[0]['metadata']}
        onUpdateProperty={() => undefined}
      />,
    );

    expect(screen.getByText('No parts detected')).toBeInTheDocument();
  });
});
