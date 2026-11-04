/**
 * Reproduces the inspector-edit → save failure bug.
 */
import { parseMotionDocument, serializeMotionDocument } from '../lib/motion/schema';
import { createStarterMotionDocument } from '../lib/motion/defaults';
import { applyMotionOp } from '../lib/motion/ops';

// Disable dev-mode validation in ops so it doesn't interfere
const origEnv = process.env.NODE_ENV;
beforeAll(() => { process.env.NODE_ENV = 'production'; });
afterAll(() => { process.env.NODE_ENV = origEnv; });

describe('motion save after inspector edit', () => {
  it('saves without NODE_PROPS_INVALID after any inspector edit', () => {
    // 1. Create starter document
    const raw = createStarterMotionDocument();
    
    // 2. Parse (simulates openProject flow)
    const doc = parseMotionDocument(raw);
    
    // Log node 1 props
    const node1 = doc.scene.nodes[1];
    console.log('Node 1:', node1?.id, '(', node1?.type, ')');
    console.log('Node 1 props:', node1?.props);
    
    // 3. Edit ANY property (simulates inspector change)
    // Edit the camera position (node 0), leaving node 1 untouched
    const edited = applyMotionOp(doc, {
      op: 'scene.node.update',
      nodeId: 'camera',
      transform: { position: [0, 0, 2.5] }
    });
    
    console.log('Node 1 props after edit:', edited.scene.nodes[1]?.props);
    
    // 4. Save: parseMotionDocument should not throw
    expect(() => parseMotionDocument(edited)).not.toThrow();
  });

  it('saves without NODE_PROPS_INVALID after editing device.tablet opacity', () => {
    const raw = createStarterMotionDocument();
    const doc = parseMotionDocument(raw);
    
    // Edit the device.tablet directly
    const edited = applyMotionOp(doc, {
      op: 'scene.node.update',
      nodeId: 'product',
      props: { opacity: 0.5 }
    });
    
    console.log('device.tablet props after edit:', edited.scene.nodes[1]?.props);
    
    expect(() => parseMotionDocument(edited)).not.toThrow();
  });
});
