import { createStarterMotionDocument } from '@/lib/motion/defaults';
import { validateMotionDocument } from '@/lib/motion/schema';
import type { MotionDocument } from '@/lib/motion/types';

describe('validateMotionDocument', () => {
  it.each([
    ['DOCUMENT_NAME_EMPTY', 'meta.name', (doc: MotionDocument) => { doc.meta.name = '  '; }],
    ['OUTPUT_FPS_RANGE', 'meta.output.fps', (doc: MotionDocument) => { doc.meta.output.fps = 300; }],
    ['PARENT_MISSING', 'scene.nodes.2.parentId', (doc: MotionDocument) => { doc.scene.nodes[2].parentId = 'missing'; }],
    ['KEYFRAME_OUT_OF_BOUNDS', 'timeline.clips.0.channels.0.keyframes.0.time', (doc: MotionDocument) => { doc.timeline.clips[0].channels[0].keyframes[0].time = 99; }],
    ['ASSET_PATH_NOT_RELATIVE', 'assets.0.path', (doc: MotionDocument) => { doc.assets[0].path = 'data:image/png;base64,abc'; }],
  ])('reports %s at the stable path %s', (code, path, corrupt) => {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    corrupt(doc);
    expect(validateMotionDocument(doc).find((error) => error.code === code)?.path).toBe(path);
  });

  it('returns errors in stable validation order', () => {
    const doc = createStarterMotionDocument('2026-01-01T00:00:00.000Z');
    doc.meta.name = '';
    doc.meta.output.fps = 0;
    expect(validateMotionDocument(doc).slice(0, 2)).toEqual([
      { code: 'DOCUMENT_NAME_EMPTY', path: 'meta.name' },
      { code: 'OUTPUT_FPS_RANGE', path: 'meta.output.fps' },
    ]);
  });
});
