import { MotionPipeline } from './types';
import { PipelineToolRegistry } from './tool-factory';

/**
 * Built-in pipeline library for common Motion operations
 */
export class BuiltInPipelineLibrary {
  private static instance: BuiltInPipelineLibrary;
  private pipelines: Map<string, MotionPipeline> = new Map();

  private constructor() {
    this.initializeBuiltins();
  }

  static getInstance(): BuiltInPipelineLibrary {
    if (!BuiltInPipelineLibrary.instance) {
      BuiltInPipelineLibrary.instance = new BuiltInPipelineLibrary();
    }
    return BuiltInPipelineLibrary.instance;
  }

  /**
   * Initialize all built-in pipelines
   */
  private initializeBuiltins(): void {
    const now = new Date().toISOString();

    // Lighting setup
    this.pipelines.set('setup-directional-lights', {
      id: 'setup-directional-lights',
      name: 'Setup Directional Lights',
      description: 'Create and configure directional lights for scene',
      category: 'lighting',
      tags: ['lighting', 'setup', 'procedural'],
      params: ['intensity', 'color'],
      steps: [
        {
          op: 'op',
          params: {
            op: 'node.create',
            nodeId: 'light-sun',
            type: 'light.directional',
          },
        },
        {
          op: 'op',
          params: {
            op: 'node.update',
            nodeId: 'light-sun',
            intensity: '{{intensity}}',
            color: '{{color}}',
          },
        },
      ],
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
    });

    // Animation setup
    this.pipelines.set('setup-keyframe-animation', {
      id: 'setup-keyframe-animation',
      name: 'Setup Keyframe Animation',
      description: 'Create keyframe animation on all selected nodes',
      category: 'animation',
      tags: ['animation', 'keyframes', 'procedural'],
      params: ['duration', 'startValue', 'endValue'],
      steps: [
        {
          op: 'loop',
          over: { type: 'nodes' },
          variable: 'node',
          body: [
            {
              op: 'op',
              params: {
                op: 'keyframe.add',
                nodeId: '{{node.id}}',
                time: 0,
                value: '{{startValue}}',
              },
            },
            {
              op: 'op',
              params: {
                op: 'keyframe.add',
                nodeId: '{{node.id}}',
                time: '{{duration}}',
                value: '{{endValue}}',
              },
            },
          ],
        },
      ],
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
    });

    // Scene optimization
    this.pipelines.set('optimize-scene', {
      id: 'optimize-scene',
      name: 'Optimize Scene',
      description: 'Optimize scene by removing unused assets and optimizing materials',
      category: 'optimization',
      tags: ['optimization', 'performance', 'cleanup'],
      params: [],
      steps: [
        {
          op: 'loop',
          over: { type: 'nodes' },
          body: [
            {
              op: 'branch',
              condition: {
                type: 'property-value',
                nodeId: '{{item.id}}',
                property: 'visibility',
                operator: '==',
                value: false,
              },
              then: [
                {
                  op: 'op',
                  params: {
                    op: 'node.delete',
                    nodeId: '{{item.id}}',
                  },
                },
              ],
            },
          ],
        },
      ],
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
    });

    // Camera setup
    this.pipelines.set('setup-camera', {
      id: 'setup-camera',
      name: 'Setup Camera',
      description: 'Create or update main camera with standard settings',
      category: 'camera',
      tags: ['camera', 'setup'],
      params: ['positionX', 'positionY', 'positionZ', 'fov'],
      steps: [
        {
          op: 'if',
          condition: { type: 'node-exists', nodeId: 'camera-main' },
          then: [
            {
              op: 'op',
              params: {
                op: 'node.update',
                nodeId: 'camera-main',
                position: [
                  '{{positionX}}',
                  '{{positionY}}',
                  '{{positionZ}}',
                ],
                fov: '{{fov}}',
              },
            },
          ],
          else: [
            {
              op: 'op',
              params: {
                op: 'node.create',
                nodeId: 'camera-main',
                type: 'camera',
                position: [
                  '{{positionX}}',
                  '{{positionY}}',
                  '{{positionZ}}',
                ],
                fov: '{{fov}}',
              },
            },
          ],
        },
      ],
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
    });

    // Material update
    this.pipelines.set('update-materials', {
      id: 'update-materials',
      name: 'Update Materials',
      description: 'Update material properties on all meshes',
      category: 'materials',
      tags: ['materials', 'appearance'],
      params: ['roughness', 'metallic'],
      steps: [
        {
          op: 'loop',
          over: { type: 'nodes', nodeType: 'mesh' },
          variable: 'mesh',
          body: [
            {
              op: 'op',
              params: {
                op: 'material.update',
                nodeId: '{{mesh.id}}',
                roughness: '{{roughness}}',
                metallic: '{{metallic}}',
              },
            },
          ],
        },
      ],
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
    });

    // Environment setup
    this.pipelines.set('setup-environment', {
      id: 'setup-environment',
      name: 'Setup Environment',
      description: 'Configure environment with lighting and background',
      category: 'environment',
      tags: ['environment', 'setup', 'procedural'],
      params: ['skyboxUrl', 'ambientIntensity'],
      steps: [
        {
          op: 'op',
          params: {
            op: 'environment.set-skybox',
            url: '{{skyboxUrl}}',
          },
        },
        {
          op: 'op',
          params: {
            op: 'environment.set-ambient',
            intensity: '{{ambientIntensity}}',
          },
        },
      ],
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Get pipeline by ID
   */
  getPipeline(id: string): MotionPipeline | undefined {
    return this.pipelines.get(id);
  }

  /**
   * Get all built-in pipelines
   */
  getAllPipelines(): MotionPipeline[] {
    return Array.from(this.pipelines.values());
  }

  /**
   * Get pipelines by category
   */
  getPipelinesByCategory(category: string): MotionPipeline[] {
    return this.getAllPipelines().filter(p => p.category === category);
  }

  /**
   * Get pipelines by tags
   */
  getPipelinesByTag(tag: string): MotionPipeline[] {
    return this.getAllPipelines().filter(p =>
      p.tags?.includes(tag)
    );
  }

  /**
   * Search pipelines by name or description
   */
  searchPipelines(query: string): MotionPipeline[] {
    const lower = query.toLowerCase();
    return this.getAllPipelines().filter(
      p =>
        p.name.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower) ||
        p.id.toLowerCase().includes(lower)
    );
  }

  /**
   * Get list of all categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.getAllPipelines().forEach(p => {
      if (p.category) categories.add(p.category);
    });
    return Array.from(categories).sort();
  }

  /**
   * Get list of all tags
   */
  getAllTags(): string[] {
    const tags = new Set<string>();
    this.getAllPipelines().forEach(p => {
      p.tags?.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }

  /**
   * Library statistics
   */
  getStats(): {
    totalPipelines: number;
    byCategory: Record<string, number>;
    byTag: Record<string, number>;
  } {
    const stats = {
      totalPipelines: this.pipelines.size,
      byCategory: {} as Record<string, number>,
      byTag: {} as Record<string, number>,
    };

    this.getAllPipelines().forEach(p => {
      if (p.category) {
        stats.byCategory[p.category] =
          (stats.byCategory[p.category] || 0) + 1;
      }
      p.tags?.forEach(tag => {
        stats.byTag[tag] = (stats.byTag[tag] || 0) + 1;
      });
    });

    return stats;
  }
}

/**
 * Pipeline integration manager
 */
export class PipelineIntegrationManager {
  private registry: PipelineToolRegistry;
  private library: BuiltInPipelineLibrary;

  constructor() {
    this.registry = new PipelineToolRegistry();
    this.library = BuiltInPipelineLibrary.getInstance();
  }

  /**
   * Register all built-in pipelines as tools
   */
  registerBuiltins(): void {
    const pipelines = this.library.getAllPipelines();
    this.registry.registerMany(pipelines);
  }

  /**
   * Register custom pipelines
   */
  registerCustom(pipelines: MotionPipeline[]): void {
    this.registry.registerMany(pipelines);
  }

  /**
   * Get registry
   */
  getRegistry(): PipelineToolRegistry {
    return this.registry;
  }

  /**
   * Get library
   */
  getLibrary(): BuiltInPipelineLibrary {
    return this.library;
  }

  /**
   * Get combined statistics
   */
  getStatistics(): {
    pipelines: { total: number; byCategory: Record<string, number> };
    tools: { total: number; byRisk: Record<string, number> };
  } {
    const libraryStats = this.library.getStats();
    const toolStats = this.registry.getStats();

    return {
      pipelines: {
        total: libraryStats.totalPipelines,
        byCategory: libraryStats.byCategory,
      },
      tools: {
        total: toolStats.totalTools,
        byRisk: toolStats.byRisk,
      },
    };
  }

  /**
   * Get discovery interface (for UI/agent discovery)
   */
  getDiscoveryInterface(): {
    categories: string[];
    tags: string[];
    pipelines: (MotionPipeline & { toolName: string })[];
  } {
    const categories = this.library.getCategories();
    const tags = this.library.getAllTags();
    const pipelines = this.library.getAllPipelines().map(p => ({
      ...p,
      toolName: `pipeline_${p.id}`,
    }));

    return { categories, tags, pipelines };
  }
}

/**
 * Export singleton instances for application-wide use
 */
export const pipelineLibrary = BuiltInPipelineLibrary.getInstance();
export const pipelineIntegration = new PipelineIntegrationManager();
