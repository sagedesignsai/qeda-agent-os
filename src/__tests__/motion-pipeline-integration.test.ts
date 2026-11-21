import { describe, it, expect, beforeEach } from 'bun:test';
import {
  BuiltInPipelineLibrary,
  PipelineIntegrationManager,
  pipelineLibrary,
  pipelineIntegration,
} from '../lib/motion/pipeline/integration';
import { MotionPipeline } from '../lib/motion/pipeline/types';

describe('Pipeline Integration & Built-ins', () => {
  let library: BuiltInPipelineLibrary;
  let manager: PipelineIntegrationManager;

  beforeEach(() => {
    library = BuiltInPipelineLibrary.getInstance();
    manager = new PipelineIntegrationManager();
  });

  describe('BuiltInPipelineLibrary', () => {
    it('should be a singleton', () => {
      const lib1 = BuiltInPipelineLibrary.getInstance();
      const lib2 = BuiltInPipelineLibrary.getInstance();

      expect(lib1).toBe(lib2);
    });

    it('should have all built-in pipelines', () => {
      const pipelines = library.getAllPipelines();

      expect(pipelines.length).toBeGreaterThan(0);
      expect(pipelines.length).toBeGreaterThanOrEqual(5);
    });

    it('should include setup-directional-lights pipeline', () => {
      const pipeline = library.getPipeline('setup-directional-lights');

      expect(pipeline).toBeDefined();
      expect(pipeline?.name).toContain('Directional Lights');
      expect(pipeline?.category).toBe('lighting');
    });

    it('should include setup-keyframe-animation pipeline', () => {
      const pipeline = library.getPipeline('setup-keyframe-animation');

      expect(pipeline).toBeDefined();
      expect(pipeline?.category).toBe('animation');
    });

    it('should include optimize-scene pipeline', () => {
      const pipeline = library.getPipeline('optimize-scene');

      expect(pipeline).toBeDefined();
      expect(pipeline?.category).toBe('optimization');
    });

    it('should include setup-camera pipeline', () => {
      const pipeline = library.getPipeline('setup-camera');

      expect(pipeline).toBeDefined();
      expect(pipeline?.category).toBe('camera');
    });

    it('should include update-materials pipeline', () => {
      const pipeline = library.getPipeline('update-materials');

      expect(pipeline).toBeDefined();
      expect(pipeline?.category).toBe('materials');
    });

    it('should include setup-environment pipeline', () => {
      const pipeline = library.getPipeline('setup-environment');

      expect(pipeline).toBeDefined();
      expect(pipeline?.category).toBe('environment');
    });

    it('should return undefined for non-existent pipeline', () => {
      const pipeline = library.getPipeline('non-existent');

      expect(pipeline).toBeUndefined();
    });

    it('should get pipelines by category', () => {
      const lighting = library.getPipelinesByCategory('lighting');
      const animation = library.getPipelinesByCategory('animation');

      expect(lighting.length).toBeGreaterThan(0);
      expect(animation.length).toBeGreaterThan(0);
      expect(lighting[0].category).toBe('lighting');
      expect(animation[0].category).toBe('animation');
    });

    it('should get pipelines by tag', () => {
      const procedural = library.getPipelinesByTag('procedural');

      expect(procedural.length).toBeGreaterThan(0);
      procedural.forEach(p => {
        expect(p.tags).toContain('procedural');
      });
    });

    it('should search pipelines by query', () => {
      const results = library.searchPipelines('light');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(p =>
        p.name.toLowerCase().includes('light')
      )).toBe(true);
    });

    it('should search by description', () => {
      const results = library.searchPipelines('material');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should search by ID', () => {
      const results = library.searchPipelines('setup-camera');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('setup-camera');
    });

    it('should return case-insensitive search results', () => {
      const resultsLower = library.searchPipelines('camera');
      const resultsUpper = library.searchPipelines('CAMERA');

      expect(resultsLower.length).toBe(resultsUpper.length);
    });

    it('should get all categories', () => {
      const categories = library.getCategories();

      expect(categories.length).toBeGreaterThan(0);
      expect(categories).toContain('lighting');
      expect(categories).toContain('animation');
      expect(categories.every(c => typeof c === 'string')).toBe(true);
    });

    it('should sort categories', () => {
      const categories = library.getCategories();

      expect(categories).toEqual([...categories].sort());
    });

    it('should get all tags', () => {
      const tags = library.getAllTags();

      expect(tags.length).toBeGreaterThan(0);
      expect(tags.every(t => typeof t === 'string')).toBe(true);
    });

    it('should sort tags', () => {
      const tags = library.getAllTags();

      expect(tags).toEqual([...tags].sort());
    });

    it('should provide library statistics', () => {
      const stats = library.getStats();

      expect(stats.totalPipelines).toBeGreaterThan(0);
      expect(stats.byCategory).toBeDefined();
      expect(stats.byTag).toBeDefined();
      expect(Object.keys(stats.byCategory).length).toBeGreaterThan(0);
    });

    it('should have valid pipeline structure', () => {
      const pipelines = library.getAllPipelines();

      pipelines.forEach(p => {
        expect(p.id).toBeDefined();
        expect(p.name).toBeDefined();
        expect(p.description).toBeDefined();
        expect(p.params).toBeDefined();
        expect(Array.isArray(p.steps)).toBe(true);
        expect(p.createdAt).toBeDefined();
        expect(p.updatedAt).toBeDefined();
      });
    });

    it('should have parameters in setup pipelines', () => {
      const setup = library.getPipeline('setup-directional-lights');

      expect(setup?.params.length).toBeGreaterThan(0);
    });

    it('should have steps in all pipelines', () => {
      const pipelines = library.getAllPipelines();

      pipelines.forEach(p => {
        expect(p.steps.length).toBeGreaterThan(0);
      });
    });
  });

  describe('PipelineIntegrationManager', () => {
    it('should create manager instance', () => {
      expect(manager).toBeDefined();
      expect(manager.getRegistry()).toBeDefined();
      expect(manager.getLibrary()).toBeDefined();
    });

    it('should register all built-ins', () => {
      manager.registerBuiltins();
      const registry = manager.getRegistry();
      const tools = registry.getAllTools();

      expect(tools.length).toBeGreaterThan(0);
    });

    it('should register custom pipelines', () => {
      const now = new Date().toISOString();
      const custom: MotionPipeline = {
        id: 'custom-pipe',
        name: 'Custom Pipeline',
        description: 'A custom pipeline',
        params: [],
        steps: [
          { op: 'op', params: { op: 'document.rename', name: 'Test' } },
        ],
        createdAt: now,
        updatedAt: now,
      };

      manager.registerCustom([custom]);
      const tool = manager.getRegistry().getTool('pipeline_custom-pipe');

      expect(tool).toBeDefined();
    });

    it('should provide combined statistics', () => {
      manager.registerBuiltins();
      const stats = manager.getStatistics();

      expect(stats.pipelines).toBeDefined();
      expect(stats.tools).toBeDefined();
      expect(stats.pipelines.total).toBeGreaterThan(0);
      expect(stats.tools.total).toBeGreaterThan(0);
    });

    it('should provide discovery interface', () => {
      manager.registerBuiltins();
      const discovery = manager.getDiscoveryInterface();

      expect(discovery.categories).toBeDefined();
      expect(discovery.tags).toBeDefined();
      expect(discovery.pipelines).toBeDefined();
      expect(Array.isArray(discovery.categories)).toBe(true);
      expect(Array.isArray(discovery.tags)).toBe(true);
      expect(Array.isArray(discovery.pipelines)).toBe(true);
    });

    it('should include tool names in discovery', () => {
      manager.registerBuiltins();
      const discovery = manager.getDiscoveryInterface();

      discovery.pipelines.forEach(p => {
        expect(p.toolName).toMatch(/^pipeline_/);
        expect(p.toolName).toContain(p.id);
      });
    });

    it('should not duplicate registrations', () => {
      manager.registerBuiltins();
      manager.registerBuiltins();
      const tools = manager.getRegistry().getAllTools();

      const uniqueIds = new Set(tools.map(t => t.pipelineId));
      expect(uniqueIds.size).toBe(tools.length);
    });
  });

  describe('Singleton instances', () => {
    it('should export library singleton', () => {
      expect(pipelineLibrary).toBeDefined();
      expect(pipelineLibrary).toBe(BuiltInPipelineLibrary.getInstance());
    });

    it('should export integration singleton', () => {
      expect(pipelineIntegration).toBeDefined();
      expect(pipelineIntegration).toBeInstanceOf(PipelineIntegrationManager);
    });

    it('should maintain consistency across imports', () => {
      const lib1 = pipelineLibrary;
      const lib2 = BuiltInPipelineLibrary.getInstance();

      expect(lib1).toBe(lib2);
    });
  });

  describe('Pipeline validation', () => {
    it('should have non-empty names', () => {
      const pipelines = library.getAllPipelines();

      pipelines.forEach(p => {
        expect(p.name.length).toBeGreaterThan(0);
      });
    });

    it('should have non-empty descriptions', () => {
      const pipelines = library.getAllPipelines();

      pipelines.forEach(p => {
        expect(p.description.length).toBeGreaterThan(0);
      });
    });

    it('should have valid timestamps', () => {
      const pipelines = library.getAllPipelines();

      pipelines.forEach(p => {
        expect(new Date(p.createdAt).getTime()).toBeGreaterThan(0);
        expect(new Date(p.updatedAt).getTime()).toBeGreaterThan(0);
      });
    });

    it('should have version info', () => {
      const pipelines = library.getAllPipelines();

      pipelines.forEach(p => {
        expect(p.version).toBeDefined();
        expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });

    it('should have tags as array', () => {
      const pipelines = library.getAllPipelines();

      pipelines.forEach(p => {
        if (p.tags) {
          expect(Array.isArray(p.tags)).toBe(true);
          expect(p.tags.every(t => typeof t === 'string')).toBe(true);
        }
      });
    });

    it('should have category defined', () => {
      const pipelines = library.getAllPipelines();

      pipelines.forEach(p => {
        expect(p.category).toBeDefined();
        expect(p.category?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Search functionality', () => {
    it('should find by partial name match', () => {
      const results = library.searchPipelines('setup');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(p => p.name.includes('setup') || p.id.includes('setup'))).toBe(true);
    });

    it('should find by partial description match', () => {
      const results = library.searchPipelines('keyframe');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', () => {
      const results = library.searchPipelines('zzzzzzzzz');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should be case-insensitive', () => {
      const lower = library.searchPipelines('light');
      const upper = library.searchPipelines('LIGHT');
      const mixed = library.searchPipelines('LiGhT');

      expect(lower.length).toBe(upper.length);
      expect(lower.length).toBe(mixed.length);
    });
  });

  describe('Category and tag operations', () => {
    it('should list unique categories', () => {
      const categories = library.getCategories();
      const uniqueSet = new Set(categories);

      expect(uniqueSet.size).toBe(categories.length);
    });

    it('should list unique tags', () => {
      const tags = library.getAllTags();
      const uniqueSet = new Set(tags);

      expect(uniqueSet.size).toBe(tags.length);
    });

    it('should filter by exact category', () => {
      const all = library.getAllPipelines();
      const lighting = library.getPipelinesByCategory('lighting');

      expect(lighting.length).toBeGreaterThan(0);
      expect(lighting.length).toBeLessThanOrEqual(all.length);
      expect(lighting.every(p => p.category === 'lighting')).toBe(true);
    });

    it('should filter by exact tag', () => {
      const setup = library.getPipelinesByTag('setup');

      expect(setup.length).toBeGreaterThan(0);
      expect(setup.every(p => p.tags?.includes('setup'))).toBe(true);
    });
  });
});
