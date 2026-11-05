/**
 * __tests__/motion-templates.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the template catalog produces independent editable documents and
 * that every template scene actually animates: clips/keyframes present, valid
 * under the schema, and sampling through evaluateMotionFrame without throwing.
 */

import { createMotionTemplate, MOTION_TEMPLATES } from '@/lib/motion/templates';
import { evaluateMotionFrame } from '@/lib/motion/evaluate';
import { preflightMotionExport } from '@/lib/motion/export/preflight';
import { parseMotionDocument } from '@/lib/motion/schema';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Motion templates', () => {
  it('creates a fresh document matching each template manifest', () => {
    const documents = [];
    for (const template of MOTION_TEMPLATES) {
      const document = createMotionTemplate(template.id);
      expect(() => parseMotionDocument(JSON.parse(JSON.stringify(document)))).not.toThrow();
      expect(document.meta.name).toBe(template.name);
      expect(document.meta.output).toMatchObject({ width: template.width, height: template.height, fps: 30 });
      expect(document.scenes.reduce((sum, scene) => sum + scene.timeline.duration, 0)).toBe(template.duration);
      expect(document.scenes[0].nodes).toEqual(document.scene.nodes);
      expect(document.scene.nodes.some((node) => node.type === 'camera.perspective')).toBe(true);
      expect(document.scenes.length).toBe(template.sceneCount);
      documents.push(document);
    }
    expect(MOTION_TEMPLATES).toHaveLength(16);
    expect(documents[0].scene.nodes).not.toBe(documents[1].scene.nodes);
  });

  it('specializes mobile, software, game, and brand templates without mutating other projects', () => {
    const mobile = createMotionTemplate('mobile-app-trailer');
    const software = createMotionTemplate('saas-demo');
    const game = createMotionTemplate('game-showcase');
    const brand = createMotionTemplate('brand-sting');

    expect(mobile.scenes.length).toBeGreaterThan(1);
    expect(software.scenes.some((s) => s.nodes.some((n) => n.type === 'ui.browser'))).toBe(true);
    expect(game.scenes.some((s) => s.nodes.some((n) => n.type === 'model.gltf'))).toBe(true);
    expect(brand.scene.nodes.some((n) => n.id === 'product')).toBe(false);
    expect(mobile.meta.output).toMatchObject({ width: 1080, height: 1920 });
  });

  it('composes scenes from the new node families', () => {
    const data = createMotionTemplate('quarterly-data-story');
    expect(data.scenes.length).toBe(4);
    expect(data.scene.nodes.some((n) => n.type === 'data.kpi')).toBe(true);

    const social = createMotionTemplate('social-ad');
    expect(social.meta.output).toMatchObject({ width: 1080, height: 1080 });
    expect(social.scenes.some((s) => s.nodes.some((n) => n.type === 'graphic.badge'))).toBe(true);

    const bev = createMotionTemplate('beverage-launch');
    expect(bev.scenes.some((s) => s.nodes.some((n) => n.type === 'product.can'))).toBe(true);
  });

  it('rejects unknown template ids', () => {
    expect(() => createMotionTemplate('not-a-template')).toThrow('Unknown Motion template');
  });

  describe('bundled model references', () => {
    const expected = new Map<string, string>([
      ['product-launch-film', 'local:khronos/ChronographWatch'],
      ['social-ad', 'local:khronos/MaterialsVariantsShoe'],
      ['real-estate-tour', 'local:threejs/SheenChair'],
      ['game-showcase', 'local:khronos/CesiumMan'],
    ]);

    it('referenced catalog models exist in assets/models/catalog.json', () => {
      const catalog = JSON.parse(
        readFileSync(join(__dirname, '..', '..', 'assets', 'models', 'catalog.json'), 'utf8'),
      ) as {
        models: Array<{ id: string; boundsMin?: number[]; boundsMax?: number[] }>;
      };
      for (const modelId of expected.values()) {
        const entry = catalog.models.find((m) => m.id === modelId);
        expect(entry).toBeDefined();
        expect(entry!.boundsMin).toBeDefined();
        expect(entry!.boundsMax).toBeDefined();
      }
    });

    it('model scenes carry fit props and animated clips that survive the schema', () => {
      for (const [templateId, modelId] of expected) {
        const doc = createMotionTemplate(templateId);
        const scene = doc.scenes.find((s) => s.nodes.some((n) => n.props.assetId === modelId))!;
        expect(scene).toBeDefined();
        const model = scene.nodes.find((n) => n.type === 'model.gltf')!;
        // Scratch props drive the staging bake; before staging the model is
        // intentionally not yet resolvable (a pure document stays portable).
        expect(model.props.fitHeight).toBeGreaterThan(0);
        expect(typeof model.props.restBottom).toBe('number');
        expect(scene.timeline.clips.length).toBeGreaterThan(0);
        expect(() => parseMotionDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
      }
    });
  });

  describe('keyframes and animation', () => {
    it('gives every scene at least one clip whose placement spans the full cut', () => {
      for (const template of MOTION_TEMPLATES) {
        const doc = createMotionTemplate(template.id);
        for (const scene of doc.scenes) {
          expect(scene.timeline.clips.length).toBeGreaterThan(0);
          expect(scene.timeline.tracks.length).toBe(scene.timeline.clips.length);
          for (const clip of scene.timeline.clips) {
            // Clips must span the whole scene: the sampler drops a clip once its
            // placement window ends, so anything shorter snaps the node back to
            // its static props mid-scene.
            expect(clip.duration).toBe(scene.timeline.duration);
            for (const channel of clip.channels) {
              expect(scene.nodes.some((n) => n.id === channel.targetId)).toBe(true);
              expect(channel.keyframes.length).toBeGreaterThan(1);
            }
          }
          for (const track of scene.timeline.tracks) {
            expect(track.placements).toHaveLength(1);
            const placement = track.placements[0];
            expect(placement.start).toBe(0);
            expect(placement.duration).toBe(scene.timeline.duration);
          }
        }
      }
    });

    it('validates every animated document and evaluates every scene without throwing', () => {
      for (const template of MOTION_TEMPLATES) {
        const doc = createMotionTemplate(template.id);
        expect(() => parseMotionDocument(JSON.parse(JSON.stringify(doc)))).not.toThrow();
        for (const scene of doc.scenes) {
          const duration = scene.timeline.duration as number;
          for (const t of [0.05, duration * 0.5, duration - 0.05]) {
            expect(() => evaluateMotionFrame(scene, t)).not.toThrow();
          }
        }
      }
    });

    it('counts the quarterly KPI up from zero to its rest value', () => {
      const doc = createMotionTemplate('quarterly-data-story');
      const kpiOf = (t: number) =>
        evaluateMotionFrame(doc.scenes[0], t).nodes.find((n) => n.id === 'kpi')!;
      expect(kpiOf(0.2).props.value).toBe(0);
      expect(kpiOf(0.2).props.opacity).toBe(0);
      const settled = kpiOf(4);
      expect(settled.props.value).toBe(12840);
      expect(settled.props.opacity).toBe(1);
    });

    it('reveals charts through the progress channel then holds at 1', () => {
      const doc = createMotionTemplate('quarterly-data-story');
      const progressAt = (t: number) =>
        evaluateMotionFrame(doc.scenes[1], t).nodes.find((n) => n.id === 'chart')!.props.progress as number;
      expect(progressAt(0.2)).toBe(0);
      expect(progressAt(2)).toBeGreaterThan(0);
      expect(progressAt(2)).toBeLessThan(1);
      expect(progressAt(5)).toBe(1);

      const pitch = createMotionTemplate('pitch-intro');
      const bars = (t: number) =>
        evaluateMotionFrame(pitch.scenes[1], t).nodes.find((n) => n.id === 'chart')!.props.progress as number;
      expect(bars(5)).toBe(1);
    });

    it('spins heroes one full turn and ends at the rest pose', () => {
      const doc = createMotionTemplate('product-launch-film');
      const rotAt = (t: number) =>
        evaluateMotionFrame(doc.scenes[1], t).nodes.find((n) => n.id === 'product')!.transform.rotation[1] as number;
      expect(rotAt(0.05)).toBeGreaterThan(0);
      expect(rotAt(0.05)).toBeLessThan(0.2);
      const half = rotAt(3);
      expect(half).toBeGreaterThan(2.5);
      expect(half).toBeLessThan(3.7);
      expect(rotAt(5.95)).toBeCloseTo(Math.PI * 2, 1);
    });

    it('pushes cameras from far to the scene rest position', () => {
      const doc = createMotionTemplate('saas-demo');
      const camZ = (t: number) =>
        evaluateMotionFrame(doc.scenes[0], t).nodes.find((n) => n.id === 'cam')!.transform.position[2] as number;
      expect(camZ(0.05)).toBeGreaterThan(7.9);
      expect(camZ(3.95)).toBeCloseTo(7, 1);
    });

    it('staggers credit fades so later credits stay hidden while earlier reveal', () => {
      const doc = createMotionTemplate('title-sequence');
      const opacityOf = (id: string, t: number) =>
        evaluateMotionFrame(doc.scenes[1], t).nodes.find((n) => n.id === id)!.props.opacity as number;
      expect(opacityOf('c1', 5.5)).toBe(1);
      expect(opacityOf('c3', 1)).toBe(0);
      expect(opacityOf('c3', 5.5)).toBe(1);
    });
  });
});
