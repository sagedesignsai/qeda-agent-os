import type { MotionDocument } from './types';

export type MotionChangeAction = 'added' | 'removed' | 'updated';
export type MotionChangeEntity = 'document' | 'brand' | 'sequence' | 'scene' | 'node' | 'asset';

export type MotionChange = {
  action: MotionChangeAction;
  entity: MotionChangeEntity;
  id: string;
  label: string;
  sceneId?: string;
  path?: string;
  before?: unknown;
  after?: unknown;
};

export type MotionDocumentDiff = {
  changes: MotionChange[];
  counts: Record<string, number>;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function compare(
  changes: MotionChange[],
  entity: MotionChangeEntity,
  id: string,
  label: string,
  before: unknown,
  after: unknown,
  sceneId?: string,
): void {
  if (before === undefined && after === undefined) return;
  const beforeJson = before === undefined ? undefined : stable(before);
  const afterJson = after === undefined ? undefined : stable(after);
  if (beforeJson === afterJson) return;
  changes.push({
    action: before === undefined ? 'added' : after === undefined ? 'removed' : 'updated',
    entity,
    id,
    label,
    ...(sceneId ? { sceneId } : {}),
    before,
    after,
  });
}

export function diffMotionDocuments(before: MotionDocument, after: MotionDocument): MotionDocumentDiff {
  const changes: MotionChange[] = [];
  compare(changes, 'document', before.meta.id, after.meta.name || before.meta.name, before.meta, after.meta);
  compare(changes, 'brand', 'brand', after.brand.name || 'Brand', before.brand, after.brand);
  compare(changes, 'sequence', 'sequence', 'Sequence', before.sequence, after.sequence);

  const scenes = new Map([...before.scenes, ...after.scenes].map((scene) => [scene.id, scene] as const));
  for (const id of [...scenes.keys()].sort()) {
    const left = before.scenes.find((scene) => scene.id === id);
    const right = after.scenes.find((scene) => scene.id === id);
    compare(changes, 'scene', id, right?.name ?? left?.name ?? id, left, right);
    const nodes = new Map([...(left?.nodes ?? []), ...(right?.nodes ?? [])].map((node) => [node.id, node] as const));
    for (const nodeId of [...nodes.keys()].sort()) {
      const nodeBefore = left?.nodes.find((node) => node.id === nodeId);
      const nodeAfter = right?.nodes.find((node) => node.id === nodeId);
      compare(changes, 'node', nodeId, nodeAfter?.name ?? nodeBefore?.name ?? nodeId, nodeBefore, nodeAfter, id);
    }
  }

  const assets = new Map([...before.assets, ...after.assets].map((asset) => [asset.id, asset] as const));
  for (const id of [...assets.keys()].sort()) {
    const left = before.assets.find((asset) => asset.id === id);
    const right = after.assets.find((asset) => asset.id === id);
    compare(changes, 'asset', id, right?.name ?? left?.name ?? id, left, right);
  }

  const counts: Record<string, number> = {};
  for (const change of changes) {
    const key = `${change.action}:${change.entity}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return { changes, counts };
}
