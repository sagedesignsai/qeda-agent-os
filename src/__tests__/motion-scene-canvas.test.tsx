jest.mock('@react-three/fiber', () => ({
  Canvas: () => null,
  useFrame: jest.fn(),
  useThree: jest.fn(),
}));

jest.mock('@react-three/drei', () => ({
  Html: () => null,
  Text: () => null,
}));

jest.mock('three', () => ({
  Color: class Color {},
  PerspectiveCamera: class PerspectiveCamera {},
  SRGBColorSpace: 'srgb',
}));

import { MotionSceneCanvas } from '@/components/motion/scene/MotionSceneCanvas';

describe('MotionSceneCanvas module', () => {
  it('loads with the Three.js color-space constant available', () => {
    expect(MotionSceneCanvas).toBeDefined();
  });
});
