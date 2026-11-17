jest.mock('@react-three/fiber', () => ({
  Canvas: () => null,
  useFrame: jest.fn(),
  useThree: jest.fn(),
}));

jest.mock('@react-three/drei', () => ({
  Html: () => null,
  Text: () => null,
  TransformControls: ({ children }: { children: unknown }) => children,
}));

// The composer pulls in `postprocessing`, which reads a large slice of Three at
// module load. This test is about the canvas module graph, not rendering, so the
// composer is stubbed; the look pipeline has its own tests.
jest.mock('@/components/motion/scene/MotionLookComposer', () => ({
  MotionLookComposer: () => null,
}));

jest.mock('three', () => ({
  Color: class Color {},
  PerspectiveCamera: class PerspectiveCamera {},
  SRGBColorSpace: 'srgb',
  Vector3: class Vector3 {
    constructor(
      public x = 0,
      public y = 0,
      public z = 0,
    ) {}
  },
}));

import { MotionSceneCanvas } from '@/components/motion/scene/MotionSceneCanvas';

describe('MotionSceneCanvas module', () => {
  it('loads with the Three.js color-space constant available', () => {
    expect(MotionSceneCanvas).toBeDefined();
  });
});
