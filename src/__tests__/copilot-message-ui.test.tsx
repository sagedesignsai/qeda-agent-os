/**
 * __tests__/copilot-message-ui.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the agent-focused UI patterns in MessageList and ToolCard:
 *   • User prompts render as capped capsules with hover actions (copy & retry)
 *   • Single-line compact reasoning accordions
 *   • Natural-language dense tool execution status pills
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { MemoryRouter } from 'react-router';
import { MessageList } from '../components/chat/MessageList';
import { ToolCard } from '../components/chat/ToolCard';

// Clipboard mock
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockImplementation(() => Promise.resolve()),
  },
});

describe('Agent-focused MessageList & ToolCard UI patterns', () => {
  it('renders user message in a prompt capsule with copy and retry buttons', () => {
    const onRetry = jest.fn();
    const userMessage: UIMessage = {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Break down my project into milestones' }],
    };

    render(
      <MemoryRouter>
        <MessageList
          messages={[userMessage]}
          status="ready"
          error={undefined}
          onApproval={jest.fn()}
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );

    // Text content is visible
    expect(screen.getByText('Break down my project into milestones')).toBeInTheDocument();

    // Copy button exists and functions
    const copyButton = screen.getByTitle('Copy prompt');
    expect(copyButton).toBeInTheDocument();
    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'Break down my project into milestones',
    );

    // Retry button exists and calls onRetry
    const retryButton = screen.getByTitle('Retry / edit prompt');
    expect(retryButton).toBeInTheDocument();
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledWith('Break down my project into milestones');
  });

  it('renders reasoning in a compact single-line accordion that toggles on click', () => {
    const assistantMessage: UIMessage = {
      id: 'msg-2',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'Analyzing existing tasks and calendar blocks.' },
        { type: 'text', text: 'Here is your plan for the day.' },
      ],
    };

    render(
      <MemoryRouter>
        <MessageList
          messages={[assistantMessage]}
          status="ready"
          error={undefined}
          onApproval={jest.fn()}
        />
      </MemoryRouter>,
    );

    // Reasoning trigger line is displayed
    const reasoningTrigger = screen.getByText('Reasoning');
    expect(reasoningTrigger).toBeInTheDocument();

    // Detailed reasoning text is collapsed initially
    expect(
      screen.queryByText('Analyzing existing tasks and calendar blocks.'),
    ).not.toBeInTheDocument();

    // Clicking expands the reasoning block
    fireEvent.click(reasoningTrigger);
    expect(
      screen.getByText('Analyzing existing tasks and calendar blocks.'),
    ).toBeInTheDocument();
  });

  it('renders tool execution as a dense pill with friendly natural-language summary', () => {
    render(
      <MemoryRouter>
        <ToolCard
          toolName="createTask"
          input={{ title: 'Schedule dental checkup' }}
          output={{ success: true, id: 'task-123' }}
          state="output-available"
        />
      </MemoryRouter>,
    );

    // Natural-language label is generated
    expect(
      screen.getByText('Create task "Schedule dental checkup"'),
    ).toBeInTheDocument();
    expect(screen.getByText('finished')).toBeInTheDocument();

    // Details are initially collapsed
    expect(screen.queryByText('Input')).not.toBeInTheDocument();

    // Clicking expands parameters
    fireEvent.click(screen.getByText('Create task "Schedule dental checkup"'));
    expect(screen.getByText('Input')).toBeInTheDocument();
  });
});
