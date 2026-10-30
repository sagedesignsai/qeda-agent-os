/**
 * __tests__/motion-property-fields.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the registry-driven Motion property field controls and commit flow.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { MotionPropertyFields } from '@/components/motion/inspector/MotionPropertyFields';
import type { MotionPropertyHint } from '@/lib/motion/node-registry';
import type { MotionAsset } from '@/lib/motion/types';

const assets: MotionAsset[] = [
  {
    id: 'asset-hero',
    name: 'Hero still',
    kind: 'image',
    mimeType: 'image/png',
    path: 'assets/hero.png',
    hash: 'a'.repeat(64),
    byteSize: 64,
    frameCount: 1,
    fps: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const hints: Record<string, MotionPropertyHint> = {
  title: { label: 'Title', control: 'text', group: 'Content' },
  intensity: {
    label: 'Intensity',
    control: 'number',
    min: 0,
    max: 10,
    step: 0.1,
    group: 'Light',
  },
  opacity: {
    label: 'Opacity',
    control: 'slider',
    min: 0,
    max: 1,
    step: 0.01,
    group: 'Light',
  },
  color: { label: 'Color', control: 'color', group: 'Appearance' },
  vector: { label: 'Position', control: 'vector3', group: 'Transform' },
  image: {
    label: 'Image',
    control: 'asset',
    assetKind: 'image',
    group: 'Content',
  },
  fit: {
    label: 'Fit',
    control: 'select',
    options: [
      { value: 'contain', label: 'Fit inside' },
      { value: 'cover', label: 'Fill frame' },
    ],
    group: 'Content',
  },
  castShadow: { label: 'Cast shadows', control: 'toggle', group: 'Light' },
};

const values = {
  title: 'Key light',
  intensity: 2,
  opacity: 0.8,
  color: '#ffffff',
  vector: [1, 2, 3],
  image: 'asset-hero',
  fit: 'cover',
  castShadow: true,
};

describe('Motion property fields', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverMock });
  });

  it('renders each hinted GUI control inside its property group', () => {
    render(
      <MotionPropertyFields
        hints={hints}
        values={values}
        assets={assets}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Content properties' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Key light');
    expect(screen.getByLabelText('Intensity')).toHaveValue(2);
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getByLabelText('Color color picker')).toBeInTheDocument();
    expect(screen.getByLabelText('Position X')).toHaveValue(1);
    expect(screen.getByLabelText('Position Y')).toHaveValue(2);
    expect(screen.getByLabelText('Position Z')).toHaveValue(3);
    expect(screen.getByRole('combobox', { name: 'Image' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Fit' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Cast shadows' })).toBeChecked();
  });

  it('commits text once on blur instead of emitting each keystroke', () => {
    const onChange = jest.fn();
    render(
      <MotionPropertyFields
        hints={{ title: hints.title }}
        values={{ title: 'Key light' }}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('Title');
    fireEvent.change(input, { target: { value: 'Rim light' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('title', 'Rim light');
  });

  it('clamps a numeric field to the range declared by its hint', () => {
    const onChange = jest.fn();
    render(
      <MotionPropertyFields
        hints={{ intensity: hints.intensity }}
        values={{ intensity: 2 }}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('Intensity');
    fireEvent.change(input, { target: { value: '14' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith('intensity', 10);
  });
});
