/**
 * __tests__/motion-templates.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the Phase 1 template catalog produces independent editable documents.
 */

import { createMotionTemplate, MOTION_TEMPLATES } from '@/lib/motion/templates';
import { preflightMotionExport } from '@/main/motion/preflight';

describe('Motion templates', () => {
  it('creates a fresh document matching each template manifest', () => {
    const documents = [];
    for (const template of MOTION_TEMPLATES) {
      const document = createMotionTemplate(template.id);
      expect(document.meta.name).toBe(template.name);
      expect(document.meta.output).toMatchObject({ width: template.width, height: template.height, fps: 30 });
      expect(document.timeline.duration).toBe(template.duration);
      expect(document.scenes[0].nodes).toEqual(document.scene.nodes);
      expect(document.scene.nodes.some((node) => node.type === 'camera.perspective')).toBe(true);
      documents.push(document);
    }
    expect(MOTION_TEMPLATES).toHaveLength(6);
    expect(documents[0].scene.nodes).not.toBe(documents[1].scene.nodes);
  });

  it('specializes phone, feature, and brand templates without mutating other projects', () => {
    const phone = createMotionTemplate('app-store-preview');
    const feature = createMotionTemplate('feature-spotlight');
    const model = createMotionTemplate('model-reveal');
    const logo = createMotionTemplate('logo-sting');

    expect(phone.scene.nodes.find((node) => node.id === 'product')?.type).toBe('device.phone');
    expect(feature.scene.nodes.find((node) => node.id === 'feature_copy')?.type).toBe('text.body');
    expect(model.scene.nodes.find((node) => node.id === 'product')?.props).toMatchObject({ assetId: 'missing:model-reveal', missingAsset: true });
    expect(preflightMotionExport(model).some((issue) => issue.code === 'MOTION_ASSET_MISSING' && issue.assetId === 'missing:model-reveal')).toBe(true);
    expect(logo.scene.nodes.some((node) => node.id === 'product')).toBe(false);
    expect(logo.scene.nodes.find((node) => node.id === 'title')?.props.text).toBe('Your brand');
    expect(phone.scene.nodes.find((node) => node.id === 'title')?.props.text).toBe('App Store preview');
  });

  it('rejects unknown template ids', () => {
    expect(() => createMotionTemplate('not-a-template')).toThrow('Unknown Motion template');
  });
});
