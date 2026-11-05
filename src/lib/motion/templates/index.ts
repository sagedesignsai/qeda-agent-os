import { createEmptyMotionDocument } from '../defaults';
import { buildTemplate, type TemplateSpec, type MotionTemplate, type MotionTemplateCategory } from './spec';
export type { MotionTemplate, MotionTemplateCategory } from './spec';

import { commerceTemplates } from './commerce';
import { softwareTemplates } from './software';
import { brandTemplates } from './brand';
import { dataTemplates } from './data';
import { editorialTemplates } from './editorial';
import { eventTemplates } from './event';
import { entertainmentTemplates } from './entertainment';
import { socialTemplates } from './social';
import { causeTemplates } from './cause';

const ALL_SPECS: TemplateSpec[] = [
  ...commerceTemplates,
  ...softwareTemplates,
  ...brandTemplates,
  ...dataTemplates,
  ...editorialTemplates,
  ...eventTemplates,
  ...entertainmentTemplates,
  ...socialTemplates,
  ...causeTemplates,
];

export const MOTION_TEMPLATES: readonly MotionTemplate[] = ALL_SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  category: spec.category as any,
  description: spec.description,
  duration: spec.scenes.reduce((a, s) => a + s.duration, 0),
  width: spec.width,
  height: spec.height,
  sceneCount: spec.scenes.length,
  tags: spec.tags ?? [],
}));

export function createMotionTemplate(templateId: string) {
  const spec = ALL_SPECS.find((s) => s.id === templateId);
  if (!spec) throw new Error(`Unknown Motion template "${templateId}".`);
  return buildTemplate(spec);
}