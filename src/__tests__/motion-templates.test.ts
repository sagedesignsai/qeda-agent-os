/**
 * __tests__/motion-templates.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the Phase 1 template catalog produces independent editable documents.
 */

import { createMotionTemplate, MOTION_TEMPLATES } from '@/lib/motion/templates';
import { preflightMotionExport } from '@/lib/motion/export/preflight';
import { parseMotionDocument } from '@/lib/motion/schema';

describe('Motion templates', () => {
  it('creates a fresh document matching each template manifest', () => {
    const documents = [];
    for (const template of MOTION_TEMPLATES) {
      const document = createMotionTemplate(template.id);
      expect(() => parseMotionDocument(JSON.parse(JSON.stringify(document)))).not.toThrow();
      expect(document.meta.name).toBe(template.name);
      expect(document.meta.output).toMatchObject({ width: template.width, height: template.height, fps: 30 });
      expect(document.timeline.duration).toBe(template.duration);
      expect(document.scenes[0].nodes).toEqual(document.scene.nodes);
      expect(document.scene.nodes.some((node) => node.type === 'camera.perspective')).toBe(true);
      documents.push(document);
    }
    expect(MOTION_TEMPLATES).toHaveLength(9);
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

  it('composes the showcase scenes from the merch and software node families', () => {
    const software = createMotionTemplate('software-launch');
    expect(software.scene.nodes.find((node) => node.id === 'browser')?.type).toBe('ui.browser');
    expect(software.scene.nodes.find((node) => node.id === 'browser_screen')?.parentId).toBe('browser');
    expect(software.scene.nodes.find((node) => node.id === 'code_card')?.type).toBe('ui.code');
    expect(software.scene.nodes.find((node) => node.id === 'callout')?.type).toBe('ui.annotation');
    expect(software.scene.nodes.some((node) => node.type === 'stage.backdrop')).toBe(true);

    const merch = createMotionTemplate('merch-drop');
    expect(merch.scene.nodes.find((node) => node.id === 'mug')?.type).toBe('product.mug');
    expect(merch.scene.nodes.find((node) => node.id === 'bottle')?.type).toBe('product.bottle');
    expect(merch.scene.nodes.find((node) => node.id === 'merch_box')?.type).toBe('product.box');
    expect(merch.scene.nodes.find((node) => node.id === 'pedestal')?.type).toBe('stage.pedestal');

    const flatlay = createMotionTemplate('merch-flatlay');
    expect(flatlay.meta.output).toMatchObject({ width: 1080, height: 1080 });
    expect(flatlay.scene.nodes.find((node) => node.id === 'apparel')?.type).toBe('product.apparel');
  });

  it('rejects unknown template ids', () => {
    expect(() => createMotionTemplate('not-a-template')).toThrow('Unknown Motion template');
  });
});
