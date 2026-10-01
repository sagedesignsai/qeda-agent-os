/**
 * __tests__/research-tool-renderers.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the research tool cards in components/chat/tool-renderers.tsx.
 *
 * The load-bearing assertion here is the input passthrough: the research tools
 * carry their human-readable payload in the *input* (the question, the quote)
 * and return only an id in the output, so a renderer that reads only `output`
 * renders an empty card. That is the regression this file exists to catch.
 *
 * Companion to copilot-message-ui.test.tsx, which covers the generic ToolCard.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ToolCard } from '../components/chat/ToolCard';
import {
  ResearchCitationsCard,
  renderSpecializedTool,
} from '../components/chat/tool-renderers';

/** ToolCard needs a router because it calls useNavigate for handToTerminal. */
function renderCard(props: {
  toolName: string;
  input?: Record<string, unknown>;
  output?: unknown;
  state?: string;
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

describe('Research tool renderers', () => {
  it('renders the research question from the input, not the output', () => {
    renderCard({
      toolName: 'startResearchRun',
      input: { question: 'Which local vector store fits an Electron app?' },
      // The tool returns ONLY an id — the question is nowhere in the output.
      output: { success: true, runId: 'run-123' },
    });

    expect(
      screen.getByText('Which local vector store fits an Electron app?'),
    ).toBeInTheDocument();
    expect(screen.getByText('Research run started')).toBeInTheDocument();
  });

  it('renders an evidence quote from the input', () => {
    renderCard({
      toolName: 'recordEvidence',
      input: {
        runId: 'run-123',
        sourceId: 'src-1',
        quote: 'sqlite-vec loads as an extension, not a bundled dependency.',
        note: 'Decides the packaging story.',
      },
      output: { success: true, evidenceId: 'ev-1' },
    });

    expect(
      screen.getByText(
        'sqlite-vec loads as an extension, not a bundled dependency.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Decides the packaging story.'),
    ).toBeInTheDocument();
  });

  it('renders a recorded source with its kind badge', () => {
    renderCard({
      toolName: 'recordSource',
      input: {
        runId: 'run-123',
        url: 'https://example.com/vec',
        title: 'Vector search in SQLite',
        kind: 'web',
      },
      output: { success: true, sourceId: 'src-1' },
    });

    expect(screen.getByText('Vector search in SQLite')).toBeInTheDocument();
    expect(screen.getByText('web')).toBeInTheDocument();
  });

  describe('completeResearchRun', () => {
    const output = {
      success: true,
      runId: 'run-123',
      status: 'completed',
      citations: [
        {
          n: 1,
          title: 'Vector search in SQLite',
          url: 'https://example.com/vec',
        },
        { n: 2, title: 'Packaging native modules', url: null },
      ],
    };

    it('summarises the run and the citation count', () => {
      renderCard({ toolName: 'completeResearchRun', output });

      expect(screen.getByText('Research complete')).toBeInTheDocument();
      expect(screen.getByText('Sources (2)')).toBeInTheDocument();
    });

    it('lists numbered citations, and links only those with a url', () => {
      const { container } = render(<ResearchCitationsCard output={output} />);

      // Collapsed by default — open the panel to inspect its contents.
      fireEvent.click(screen.getByText('Sources (2)'));

      expect(
        screen.getByText('1. Vector search in SQLite'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('2. Packaging native modules'),
      ).toBeInTheDocument();

      // Exactly one anchor: a page/file source has no url and must NOT render a
      // dead link that looks identical to a working one.
      const anchors = container.querySelectorAll('a');
      expect(anchors).toHaveLength(1);
      expect(anchors[0]).toHaveAttribute('href', 'https://example.com/vec');
    });

    it('falls back to the generic card when there is no citation list', () => {
      // Nothing useful to draw — renderSpecializedTool must decline so the raw
      // result stays visible rather than an empty "Research complete" shell.
      expect(
        renderSpecializedTool('completeResearchRun', {
          success: true,
          runId: 'run-123',
          status: 'completed',
          citations: [],
        }),
      ).toBeNull();
    });
  });

  it('still renders service tools when called without an input argument', () => {
    // The signature gained an optional `input`; existing callers pass output only.
    const node = renderSpecializedTool('advancedSearch', {
      success: true,
      query: 'electron sqlite vec',
      provider: 'serper',
      results: [],
    });
    expect(node).not.toBeNull();
  });

  it('falls back to the generic card on a failed call', () => {
    renderCard({
      toolName: 'startResearchRun',
      input: { question: 'A question that never ran' },
      output: { success: false, error: 'No database connection' },
    });

    // The question must NOT be shown as if the run had started.
    expect(
      screen.queryByText('A question that never ran'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('startResearchRun')).toBeInTheDocument();
  });
});
