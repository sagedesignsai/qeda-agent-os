/**
 * main/motion/template-assets.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Binds templates to the pre-installed model library. Template `model.gltf`
 * nodes reference bundled GLBs by their catalog id (`local:khronos/CesiumMan`)
 * so the catalog stays byte-free and schema-portable; this module turns those
 * references into real project assets at project-creation time:
 *
 *   1. stage the GLB into the project (standard asset pipeline),
 *   2. commit it (content-addressed copy + hash; committed record returned),
 *   3. rewrite the node's `assetId` to the committed asset and bake a fit
 *      transform from the catalog's scene bounds (`fitHeight`/`restBottom`
 *      scratch props express the template's target footprint),
 *   4. retarget the scene's transform keyframes so the animated rest pose
 *      equals the baked rest pose,
 *   5. append the committed asset record to the document returned to the
 *      caller, whose full-document save must not clobber commitAssets' own
 *      persisted append.
 *
 * Missing catalog entries, read failures, or models without bounds keep the
 * node untouched (it stays a `missingAsset` placeholder) and surface in the
 * report — a template degrades to the placeholder look instead of
 * half-failing mid-creation.
 */

import type { MotionAsset, MotionDocument, MotionNode, MotionScene } from '../../lib/motion/types';
import type { MotionAssetCommit, MotionImportError, MotionStagedAsset } from './asset-store.js';
import { computeModelFit, retargetModelChannels, type ModelBounds } from '../../lib/motion/model-fit';
import { listLocalModels, resolveLocalModelPath, type MotionLocalModelEntry } from './local-models.js';

/** Scratch props a template uses to express its target model footprint. */
export const MODEL_FIT_PROPS = ['fitHeight', 'restBottom'] as const;

export type TemplateModelAssetStore = {
  stageAssets(projectId: string, paths: string[]): Promise<{ items: MotionStagedAsset[]; errors: MotionImportError[] }>;
  commitAssets(projectId: string, items: MotionAssetCommit[]): Promise<{ assets: MotionAsset[]; errors: MotionImportError[] }>;
};

export type TemplateModelStagingReport = {
  staged: string[];
  skipped: Array<{ modelId: string; nodeId?: string; reason: string }>;
};

/** Collect `model.gltf` nodes whose `assetId` references a bundled catalog model. */
export function findTemplateModelNodes(document: MotionDocument): Array<{ scene: MotionScene; node: MotionNode }> {
  const hits: Array<{ scene: MotionScene; node: MotionNode }> = [];
  for (const scene of document.scenes) {
    for (const node of scene.nodes) {
      if (node.type !== 'model.gltf') continue;
      const assetId = node.props.assetId;
      if (typeof assetId === 'string' && assetId.startsWith('local:')) {
        hits.push({ scene, node });
      }
    }
  }
  return hits;
}

/** Stage every bundled model a template references; returns the enriched document. */
export async function stageTemplateModels(
  projectId: string,
  document: MotionDocument,
  assetStore: TemplateModelAssetStore,
  catalog: MotionLocalModelEntry[] = listLocalModels(),
): Promise<{ document: MotionDocument; report: TemplateModelStagingReport }> {
  const report: TemplateModelStagingReport = { staged: [], skipped: [] };
  const referenced = findTemplateModelNodes(document);
  if (referenced.length === 0) return { document, report };

  // One commit per distinct catalog model — nodes sharing a model share an asset.
  const committedAssets = new Map<string, MotionAsset>();
  const failures = new Map<string, string>();

  for (const modelId of [...new Set(referenced.map(({ node }) => node.props.assetId as string))]) {
    const entry = catalog.find((m) => m.id === modelId && m.boundsMin && m.boundsMax);
    if (!entry) {
      failures.set(modelId, entry ? 'Model has no scene bounds in the catalog.' : 'Model is not in the bundled catalog.');
      continue;
    }
    try {
      const modelPath = resolveLocalModelPath(modelId);
      if (!modelPath) {
        failures.set(modelId, 'Model file is missing from the app bundle.');
        continue;
      }
      const staged = await assetStore.stageAssets(projectId, [modelPath]);
      if (!staged.items.length || staged.errors.length) {
        failures.set(modelId, staged.errors[0]?.message ?? 'Import produced no asset.');
        continue;
      }
      const committed = await assetStore.commitAssets(projectId, [
        { importId: staged.items[0].importId, kind: 'model' },
      ]);
      if (!committed.assets.length || committed.errors.length) {
        failures.set(modelId, committed.errors[0]?.message ?? 'Commit produced no asset.');
        continue;
      }
      committedAssets.set(modelId, committed.assets[0]);
      report.staged.push(modelId);
    } catch (error) {
      failures.set(modelId, error instanceof Error ? error.message : String(error));
    }
  }

  const rewriteScene = (scene: MotionScene): MotionScene => {
    // Fit plans come from the ORIGINAL nodes: transformers need each node's
    // authored rest pose and catalog bounds, and clip retargeting keys on the
    // node id, which is stable across the rewrite.
    type FitPlan = { nodeId: string; positionYShift: number; scaleRatio: number };
    const fitPlans: FitPlan[] = [];
    const nodes = scene.nodes.map((node): MotionNode => {
      if (node.type !== 'model.gltf') return node;
      const modelId = node.props.assetId;
      if (typeof modelId !== 'string' || !modelId.startsWith('local:')) return node;
      const committed = committedAssets.get(modelId);
      if (!committed) {
        report.skipped.push({ modelId, nodeId: node.id, reason: failures.get(modelId) ?? 'Staging failed.' });
        return node;
      }
      const entry = catalog.find((m) => m.id === modelId)!;
      const bounds: ModelBounds = { min: entry.boundsMin!, max: entry.boundsMax! };
      const fitHeight = node.props.fitHeight;
      const restBottom = node.props.restBottom;
      const props: Record<string, unknown> = { ...node.props, assetId: committed.id, missingAsset: false };
      for (const key of MODEL_FIT_PROPS) delete props[key];

      const transform = { ...node.transform } as MotionNode['transform'];
      const authoredScaleY = transform.scale[1];
      const authoredRestY = transform.position[1];
      if (typeof fitHeight === 'number' && typeof restBottom === 'number' && authoredScaleY > 0) {
        const fit = computeModelFit(bounds, fitHeight, restBottom);
        transform.position = [transform.position[0], fit.positionY, transform.position[2]];
        transform.scale = [fit.scale, fit.scale, fit.scale];
        fitPlans.push({
          nodeId: node.id,
          positionYShift: fit.positionY - authoredRestY,
          scaleRatio: fit.scale / authoredScaleY,
        });
      }
      return { ...node, props, transform };
    });

    let clips = scene.timeline.clips;
    for (const plan of fitPlans) {
      clips = retargetModelChannels(clips, plan.nodeId, plan.positionYShift, plan.scaleRatio);
    }
    return { ...scene, nodes, timeline: { ...scene.timeline, clips } };
  };

  const scenes = document.scenes.map(rewriteScene);

  // commitAssets appended its records to the persisted project document; the
  // caller's full-document save goes through the same records, so include them.
  const knownAssetIds = new Set(document.assets.map((asset) => asset.id));
  const newAssets = [...committedAssets.values()].filter((asset) => !knownAssetIds.has(asset.id));

  return {
    document: { ...document, scenes, assets: [...document.assets, ...newAssets] },
    report,
  };
}
