import { createEmptyMotionDocument } from '../defaults';
import { buildTemplate, type TemplateSpec, type MotionTemplate, type MotionTemplateCategory } from './template-spec';
export type { MotionTemplate, MotionTemplateCategory } from './template-spec';

import { cinematicTemplates } from './cinematic';
import { threeDTemplates } from './three-d';

const ALL_SPECS: TemplateSpec[] = [...cinematicTemplates, ...threeDTemplates];

export const MOTION_TEMPLATES: readonly MotionTemplate[] = ALL_SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  category: spec.category,
  description: spec.description,
  duration: spec.scenes.reduce((a, s) => a + s.duration, 0),
  width: spec.width,
  height: spec.height,
  fps: spec.fps ?? 30,
  sceneCount: spec.scenes.length,
  tags: spec.tags ?? [],
}));

export function createMotionTemplate(templateId: string) {
  const spec = ALL_SPECS.find((s) => s.id === templateId);
  if (!spec) throw new Error(`Unknown Motion template "${templateId}".`);
  return buildTemplate(spec);
}
