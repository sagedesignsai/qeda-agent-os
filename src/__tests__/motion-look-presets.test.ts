/**
 * __tests__/motion-look-presets.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Presets are only shippable if they produce valid FX nodes that the composer
 * can resolve, and if applying one twice does not stack two of everything.
 */

import { createStarterMotionDocument } from '@/lib/motion/defaults';
import type { MotionEntityKind } from '@/lib/motion/ids';
import { isMotionLookNode, motionLookRemovalRoots, resolveLookStack } from '@/lib/motion/look';
import { expandLookPreset, listLookPresets } from '@/lib/motion/look-presets';
import { applyMotionOps } from '@/lib/motion/ops';
import { parseMotionDocument, serializeMotionDocument } from '@/lib/motion/schema';
import type { MotionDocument } from '@/lib/motion/types';

function ids() {
  let index = 0;
  return (kind: MotionEntityKind) => `${kind}_${(index += 1)}`;
}

function applyPreset(doc: MotionDocument, id: string) {
  const existing = motionLookRemovalRoots(doc.scene.nodes).map((node) => node.id);
  return applyMotionOps(
    doc,
    expandLookPreset(id, { existingLookNodeIds: existing }, ids()),
  );
}

describe('look presets', () => {
  it('lists every preset with copy', () => {
    const presets = listLookPresets();
    expect(presets.map((preset) => preset.id)).toEqual([
      'cinematic',
      'clean-tech',
      'warm-film',
      'noir',
      'anamorphic',
      'vhs',
    ]);
    expect(presets.every((preset) => preset.description.length > 10)).toBe(true);
  });

  it('turns the cinematic preset into an ordered, resolvable stack', () => {
    const doc = applyPreset(createStarterMotionDocument(), 'cinematic');
    expect(doc.scene.nodes.filter((node) => isMotionLookNode(node.type))).toHaveLength(6);

    const stack = resolveLookStack(
      doc.scenes.find((scene) => scene.id === doc.activeSceneId)!,
      0,
    );
    expect(stack.map((look) => look.kind)).toEqual([
      'lens-distortion',
      'bloom',
      'grade',
      'vignette',
      'grain',
      'letterbox',
    ]);
  });

  it('replaces the previous look instead of stacking a second one', () => {
    const first = applyPreset(createStarterMotionDocument(), 'cinematic');
    const second = applyPreset(first, 'noir');
    expect(second.scene.nodes.filter((node) => isMotionLookNode(node.type))).toHaveLength(4);
    expect(resolveLookStack(
      second.scenes.find((scene) => scene.id === second.activeSceneId)!,
      0,
    ).map((look) => look.kind)).toEqual(['grade', 'vignette', 'grain', 'letterbox']);
  });

  it('round-trips through the schema at the current version', () => {
    const doc = applyPreset(createStarterMotionDocument(), 'anamorphic');
    const parsed = parseMotionDocument(JSON.parse(serializeMotionDocument(doc)));
    expect(parsed.schemaVersion).toBe(5);
    expect(parsed.scene.nodes.filter((node) => isMotionLookNode(node.type))).toHaveLength(6);
  });

  it('is deterministic when given deterministic ids', () => {
    const doc = createStarterMotionDocument();
    expect(serializeMotionDocument(applyPreset(doc, 'vhs'))).toBe(
      serializeMotionDocument(applyPreset(doc, 'vhs')),
    );
  });
});
