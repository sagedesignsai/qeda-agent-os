/**
 * __tests__/projects-ui-smoke.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Import-time smoke test for the Projects spine UI. Rendering is covered by the
 * route-level App test; here we only guarantee every new module parses and
 * resolves its imports (ui primitives, hooks, shared card helpers).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Projects from '../renderer/pages/Projects';
import { ProjectCard, projectIcon } from '../components/projects/ProjectCard';
import { ProjectDialog } from '../components/projects/ProjectDialog';
import { ProjectsMenu } from '../components/sidebar/ProjectsMenu';
import { ProjectScopeChip } from '../components/projects/ProjectScopeChip';
import { useProjects } from '../hooks/use-projects';
import { useProjectScope } from '../hooks/use-project-scope';

describe('projects UI modules', () => {
  it('exports the page and project components', () => {
    for (const component of [
      Projects,
      ProjectCard,
      ProjectDialog,
      ProjectsMenu,
      ProjectScopeChip,
    ]) {
      expect(typeof component).toBe('function');
    }
  });

  it('resolves a lucide icon for every project icon name', () => {
    for (const name of ['inbox', 'folder', 'target', 'kanban', 'mystery']) {
      expect(typeof projectIcon(name)).toBe('object');
    }
    expect(typeof projectIcon(null)).toBe('object');
  });

  it('exports the projects hooks', () => {
    expect(typeof useProjects).toBe('function');
    expect(typeof useProjectScope).toBe('function');
  });
});
