/**
 * __tests__/motion-templates.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the template catalog produces independent editable documents and
 * that every template scene actually animates: clips/keyframes present, valid
 * under the schema, and sampling through evaluateMotionFrame without throwing.
 */

import { createMotionTemplate, MOTION_TEMPLATES } from '@/lib/motion/templates';
import { evaluateMotionFrame } from '@/lib/motion/evaluate';
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
      expect(document.meta.output).toMatchObject({ width: template.width, height: template.height, fps: template.fps });
      expect(document.scenes.reduce((sum, scene) => sum + scene.timeline.duration, 0)).toBe(template.duration);
      expect(document.scenes[0].nodes).toEqual(document.scene.nodes);
      expect(document.scene.nodes.some((node) => node.type === 'camera.perspective')).toBe(true);
      expect(document.scenes.length).toBe(template.sceneCount);
      documents.push(document);
    }
    expect(MOTION_TEMPLATES).toHaveLength(4);
    expect(documents[0].scene.nodes).not.toBe(documents[1].scene.nodes);
  });

  it('curates a cinematic set across landscape, portrait, and brand work', () => {
    const chronograph = createMotionTemplate('chronograph-film');
    const solstice = createMotionTemplate('solstice-footwear-film');
    const afterglow = createMotionTemplate('obscura-camera-ident');

    expect(chronograph.scenes.some((scene) => scene.nodes.some((node) => node.props.assetId === 'local:khronos/ChronographWatch'))).toBe(true);
    expect(solstice.scenes.some((scene) => scene.nodes.some((node) => node.props.assetId === 'local:khronos/MaterialsVariantsShoe'))).toBe(true);
    expect(solstice.meta.output).toMatchObject({ width: 1080, height: 1920 });
    expect(afterglow.scenes.some((scene) => scene.nodes.some((node) => node.type === 'stage.particles'))).toBe(true);
    expect(afterglow.scenes.some((scene) => scene.nodes.some((node) => node.props.assetId === 'local:threejs/steampunk_camera'))).toBe(true);
    const nightshift = createMotionTemplate('nightshift-car-film');
    expect(nightshift.scenes.some((scene) => scene.nodes.some((node) => node.props.assetId === 'local:threejs/ferrari'))).toBe(true);
  });

  it('ships nested effects and transitions in each cinematic composition', () => {
    for (const template of MOTION_TEMPLATES) {
      const document = createMotionTemplate(template.id);
      expect(document.scenes.every((scene) => scene.nodes.some((node) => node.type === 'fx.stack'))).toBe(true);
    }
    const chronograph = createMotionTemplate('chronograph-film');
    expect(chronograph.sequence?.items.some((item) => item.transitionIn?.type === 'crossfade')).toBe(true);
    const afterglow = createMotionTemplate('obscura-camera-ident');
    expect(afterglow.sequence?.items.some((item) => item.transitionIn?.type === 'dip')).toBe(true);
  });

  it('rejects unknown template ids', () => {
    expect(() => createMotionTemplate('not-a-template')).toThrow('Unknown Motion template');
  });

  describe('bundled model references', () => {
    const expected = new Map<string, string>([
      ['chronograph-film', 'local:khronos/ChronographWatch'],
      ['nightshift-car-film', 'local:threejs/ferrari'],
      ['solstice-footwear-film', 'local:khronos/MaterialsVariantsShoe'],
      ['obscura-camera-ident', 'local:threejs/steampunk_camera'],
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

    it('moves the chronograph hero during its first shot', () => {
      const doc = createMotionTemplate('chronograph-film');
      const rotationAt = (time: number) =>
        evaluateMotionFrame(doc.scenes[0], time).nodes.find((node) => node.id === 'watch')!.transform.rotation[1] as number;
      expect(rotationAt(0.1)).toBeLessThan(0);
      expect(rotationAt(4)).toBeGreaterThan(0);
    });

    it('pushes the chronograph camera from its opening position', () => {
      const doc = createMotionTemplate('chronograph-film');
      const camZ = (t: number) =>
        evaluateMotionFrame(doc.scenes[0], t).nodes.find((n) => n.id === 'cam')!.transform.position[2] as number;
      expect(camZ(0.05)).toBeGreaterThan(7);
      expect(camZ(4.15)).toBeCloseTo(5.7, 1);
    });

    it('reveals the Afterglow title and subtitle in sequence', () => {
      const doc = createMotionTemplate('obscura-camera-ident');
      const opacityOf = (id: string, t: number) =>
        evaluateMotionFrame(doc.scenes[1], t).nodes.find((node) => node.id === id)!.props.opacity as number;
      expect(opacityOf('title', 0.3)).toBe(0);
      expect(opacityOf('subtitle', 1)).toBe(0);
      expect(opacityOf('title', 1.5)).toBe(1);
      expect(opacityOf('subtitle', 2)).toBe(1);
    });
  });
});
