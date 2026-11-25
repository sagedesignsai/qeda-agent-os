import type { ClipDeviceFrame, DeviceFrameType } from '@/lib/studio-types';

export type MockupPresetCategory = 'all' | 'window' | 'device' | 'minimal';

export interface DeviceMockupPreset {
  id: string;
  name: string;
  category: Exclude<MockupPresetCategory, 'all'>;
  description: string;
  frame: ClipDeviceFrame;
}

export const DEFAULT_CLIP_DEVICE_FRAME: ClipDeviceFrame = {
  type: 'browser',
  color: '#303541',
  padding: 8,
};

export const DEVICE_FRAME_TYPE_OPTIONS: Array<{
  value: DeviceFrameType;
  label: string;
}> = [
  { value: 'browser', label: 'Browser / Window' },
  { value: 'macbook', label: 'MacBook' },
  { value: 'iphone', label: 'iPhone' },
  { value: 'glass', label: 'Frosted Glass' },
  { value: 'minimal-svg', label: 'Minimal Outline' },
  { value: 'none', label: 'No Mockup' },
];

export const DEVICE_MOCKUP_PRESETS: readonly DeviceMockupPreset[] = [
  {
    id: 'safari-dark',
    name: 'Dark Browser',
    category: 'window',
    description: 'Dark macOS browser chrome with traffic lights & URL bar',
    frame: {
      type: 'browser',
      presetId: 'safari-dark',
      theme: 'dark',
      color: '#1e2430',
      padding: 8,
      url: 'qeda.app',
      shadow: true,
      glare: false,
    },
  },
  {
    id: 'safari-light',
    name: 'Light Browser',
    category: 'window',
    description: 'Clean light browser window with crisp address pill',
    frame: {
      type: 'browser',
      presetId: 'safari-light',
      theme: 'light',
      color: '#e2e8f0',
      padding: 8,
      url: 'qeda.app',
      shadow: true,
      glare: false,
    },
  },
  {
    id: 'macos-window',
    name: 'macOS Window',
    category: 'window',
    description: 'Minimal desktop app titlebar with traffic light dots',
    frame: {
      type: 'browser',
      presetId: 'macos-window',
      theme: 'dark',
      color: '#1a1f2b',
      padding: 6,
      title: 'Showcase Studio',
      shadow: true,
      glare: false,
    },
  },
  {
    id: 'macbook-pro',
    name: 'MacBook Pro',
    category: 'device',
    description: 'Space Black aluminum bezel with notch & hinge base',
    frame: {
      type: 'macbook',
      presetId: 'macbook-pro',
      theme: 'dark',
      color: '#14171f',
      padding: 10,
      shadow: true,
      glare: true,
    },
  },
  {
    id: 'macbook-silver',
    name: 'MacBook Silver',
    category: 'device',
    description: 'Silver aluminum unibody frame with camera notch',
    frame: {
      type: 'macbook',
      presetId: 'macbook-silver',
      theme: 'silver',
      color: '#94a3b8',
      padding: 10,
      shadow: true,
      glare: true,
    },
  },
  {
    id: 'iphone-titanium',
    name: 'iPhone Pro',
    category: 'device',
    description: 'Natural titanium bezel with Dynamic Island & home bar',
    frame: {
      type: 'iphone',
      presetId: 'iphone-titanium',
      theme: 'dark',
      color: '#27272a',
      padding: 12,
      shadow: true,
      glare: true,
    },
  },
  {
    id: 'frosted-glass',
    name: 'Frosted Glass',
    category: 'minimal',
    description: 'Translucent specular glass rim with soft elevation',
    frame: {
      type: 'glass',
      presetId: 'frosted-glass',
      theme: 'dark',
      color: 'rgba(220, 240, 255, 0.55)',
      padding: 8,
      shadow: true,
      glare: true,
    },
  },
  {
    id: 'minimal-studio',
    name: 'Studio Outline',
    category: 'minimal',
    description: 'Sleek hairline border with architectural corner ticks',
    frame: {
      type: 'minimal-svg',
      presetId: 'minimal-studio',
      theme: 'dark',
      color: '#334155',
      padding: 6,
      shadow: false,
      glare: false,
    },
  },
];
