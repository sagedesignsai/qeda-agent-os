/**
 * Test with an "old" project that has device.tablet without color/metalness/roughness/powerRing
 */
import { parseMotionDocument, serializeMotionDocument } from '../lib/motion/schema';
import { createStarterMotionDocument } from '../lib/motion/defaults';
import { applyMotionOp } from '../lib/motion/ops';
import type { MotionDocument } from '../lib/motion/types';

const origEnv = process.env.NODE_ENV;
beforeAll(() => { process.env.NODE_ENV = 'production'; });
afterAll(() => { process.env.NODE_ENV = origEnv; });

describe('old project without new device props', () => {
  it('opens and saves an old project that lacks color/metalness/roughness/powerRing', () => {
    // Simulate an old saved project: create starter, then remove the new props
    const raw = createStarterMotionDocument();
    
    // Strip the new fields from device.tablet to simulate old project
    const oldDoc = {
      ...raw,
      scene: {
        nodes: raw.scene.nodes.map(node => {
          if (node.type === 'device.tablet') {
            const { color, metalness, roughness, powerRing, ...oldProps } = node.props as any;
            return { ...node, props: oldProps };
          }
          return node;
        })
      },
      scenes: raw.scenes.map(scene => ({
        ...scene,
        nodes: scene.nodes.map(node => {
          if (node.type === 'device.tablet') {
            const { color, metalness, roughness, powerRing, ...oldProps } = node.props as any;
            return { ...node, props: oldProps };
          }
          return node;
        })
      }))
    } as unknown as MotionDocument;
    
    const oldNode = oldDoc.scene.nodes.find(n => n.type === 'device.tablet');
    console.log('Old device.tablet props (simulating pre-update project):', oldNode?.props);
    
    // Simulate opening the project
    let doc: MotionDocument;
    try {
      doc = parseMotionDocument(oldDoc);
      console.log('Parse OK, device.tablet props after parse:', doc.scene.nodes.find(n => n.type === 'device.tablet')?.props);
    } catch (e) {
      console.error('PARSE FAILED on load:', e instanceof Error ? e.message : e);
      throw e;
    }
    
    // Simulate an inspector edit on ANY other node
    const edited = applyMotionOp(doc, {
      op: 'scene.node.update',
      nodeId: 'camera',
      transform: { position: [0, 0, 2.5] }
    });
    
    // Save should not throw
    try {
      const saved = parseMotionDocument(edited);
      console.log('SAVE OK');
    } catch (e) {
      console.error('SAVE FAILED:', e instanceof Error ? e.message : e);
      throw e;
    }
  });
});
