/**
 * __tests__/blender-mcp-integration.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the MCP for Blender tool renderers, friendly tool summaries, and
 * the live Blender sync bridge tool.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ToolCard } from '../components/chat/ToolCard';
import {
  SPECIALIZED_TOOLS,
  renderSpecializedTool,
} from '../components/chat/tool-renderers';
import { createBlenderTools } from '../main/tools/blender';
import { mcpManager } from '../main/ai/mcp/manager';

jest.mock('../main/ai/mcp/manager', () => ({
  mcpManager: {
    executeTool: jest.fn(),
  },
}));

function renderCard(props: {
  toolName: string;
  input?: Record<string, unknown>;
  output?: unknown;
  state?: 'output-available' | 'running' | 'output-error';
}) {
  return render(
    <MemoryRouter>
      <ToolCard
        toolName={props.toolName}
        input={props.input ?? {}}
        output={props.output}
        state={props.state ?? 'output-available'}
      />
    </MemoryRouter>,
  );
}

describe('MCP for Blender Tool Renderers', () => {
  it('registers all Blender MCP tools in SPECIALIZED_TOOLS', () => {
    const expected = [
      'execute_blender_code',
      'mcp_blender_execute_blender_code',
      'look',
      'mcp_blender_look',
      'get_scene_info',
      'mcp_blender_get_scene_info',
      'search_assets',
      'mcp_blender_search_assets',
      'import_asset',
      'mcp_blender_import_asset',
      'get_guide',
      'mcp_blender_get_guide',
      'blender_session_sync',
      'blender.session.sync',
    ];

    for (const tool of expected) {
      expect(SPECIALIZED_TOOLS.has(tool)).toBe(true);
    }
  });

  it('renders look viewport card with mode, shading, and topology stats', () => {
    const node = renderSpecializedTool(
      'look',
      {
        image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        stats: {
          tris: 1200,
          quads: 600,
          ngons: 0,
          non_manifold: 0,
        },
      },
      { mode: 'topology', shading: 'wireframe', target: ['HeroChair'] },
    );

    render(<div>{node}</div>);
    expect(screen.getByText('Blender Scene View')).toBeInTheDocument();
    expect(screen.getByText('topology')).toBeInTheDocument();
    expect(screen.getByText('wireframe')).toBeInTheDocument();
    expect(screen.getByText(/1[\s,]*200/)).toBeInTheDocument();
    expect(screen.getByText('600')).toBeInTheDocument();
  });

  it('renders execute_blender_code card with script and console output', () => {
    const node = renderSpecializedTool(
      'execute_blender_code',
      { result: 'Cube added with dimensions <1.0, 1.0, 1.0>' },
      { code: 'import bpy\nbpy.ops.mesh.primitive_cube_add()' },
    );

    render(<div>{node}</div>);
    expect(screen.getByText('Blender Python (bpy)')).toBeInTheDocument();
    expect(screen.getByText(/primitive_cube_add/)).toBeInTheDocument();
    expect(screen.getByText(/Cube added with dimensions/)).toBeInTheDocument();
  });

  it('renders get_scene_info card with object hierarchy and grounding status', () => {
    const node = renderSpecializedTool(
      'get_scene_info',
      {
        objects: [
          {
            name: 'Table',
            dimensions: [1.2, 0.8, 0.75],
            grounded: true,
            face_count: 320,
            materials: ['Wood'],
          },
          {
            name: 'Lamp',
            dimensions: [0.3, 0.3, 0.6],
            grounded: false,
            face_count: 480,
            materials: ['Brass'],
          },
        ],
      },
      { root: 'Room' },
    );

    render(<div>{node}</div>);
    expect(screen.getByText('Blender Scene Hierarchy')).toBeInTheDocument();
    expect(screen.getByText('Table')).toBeInTheDocument();
    expect(screen.getByText('Grounded')).toBeInTheDocument();
    expect(screen.getByText('Lamp')).toBeInTheDocument();
    expect(screen.getByText('Floating')).toBeInTheDocument();
  });

  it('renders search_assets card with library results', () => {
    const node = renderSpecializedTool(
      'search_assets',
      {
        results: [
          {
            id: 'poly_wood_01',
            name: 'Wooden Parquet Floor',
            preview: 'https://example.com/thumb.jpg',
            licence: 'CC0',
          },
        ],
      },
      { source: 'polyhaven', query: 'wooden floor' },
    );

    render(<div>{node}</div>);
    expect(screen.getByText('3D Asset Search')).toBeInTheDocument();
    expect(screen.getByText(/polyhaven/i)).toBeInTheDocument();
    expect(screen.getByText('Wooden Parquet Floor')).toBeInTheDocument();
    expect(screen.getByText('CC0')).toBeInTheDocument();
  });

  it('renders import_asset confirmation card', () => {
    const node = renderSpecializedTool(
      'import_asset',
      { success: true },
      { source: 'sketchfab', id: 'car-vintage-123', target_size: 4.5 },
    );

    render(<div>{node}</div>);
    expect(screen.getByText('Blender Asset Imported')).toBeInTheDocument();
    expect(screen.getByText(/sketchfab/i)).toBeInTheDocument();
    expect(screen.getByText('car-vintage-123')).toBeInTheDocument();
    expect(screen.getByText(/4\.5\s*m/)).toBeInTheDocument();
  });

  it('renders get_guide card with topic', () => {
    const node = renderSpecializedTool(
      'get_guide',
      { guide: '# Retopology Workflow Guide\nKeep poly count light.' },
      { topic: 'retopology' },
    );

    render(<div>{node}</div>);
    expect(screen.getByText('Blender Workflow Guide')).toBeInTheDocument();
    expect(screen.getAllByText('retopology').length).toBeGreaterThanOrEqual(1);
  });

  it('renders friendly tool titles in ToolCard for Blender MCP tools', () => {
    renderCard({
      toolName: 'look',
      input: { mode: 'angles' },
      state: 'running',
    });
    expect(screen.getByText('Capture Blender angles view')).toBeInTheDocument();

    renderCard({
      toolName: 'execute_blender_code',
      input: { code: 'print("hello")' },
      state: 'running',
    });
    expect(screen.getByText('Execute Python in Blender')).toBeInTheDocument();

    renderCard({
      toolName: 'get_guide',
      input: { topic: 'materials' },
      state: 'running',
    });
    expect(screen.getByText('Load Blender guide: materials')).toBeInTheDocument();
  });
});

describe('createBlenderTools sync bridge', () => {
  it('exposes blender.session.sync alongside generate, import, and turntable', () => {
    const mockContext = {
      getDocument: jest.fn().mockReturnValue({ scenes: [] }),
      apply: jest.fn(),
      projectId: 'test-project',
    } as any;

    const tools = createBlenderTools(mockContext);
    expect('blender.asset.generate' in tools).toBe(true);
    expect('blender.asset.import' in tools).toBe(true);
    expect('blender.asset.turntable' in tools).toBe(true);
    expect('blender.session.sync' in tools).toBe(true);
  });
});
