/**
 * __tests__/plan-panel.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for PlanPanel UI component.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanPanel } from '../components/plan/PlanPanel';
import type { AgentPlan } from '../lib/agent-plan';

describe('PlanPanel', () => {
  const samplePlan: AgentPlan = {
    version: 1,
    createdAt: Date.now(),
    items: [
      { id: 'step-1', title: 'Inspect files in repository', status: 'done' },
      { id: 'step-2', title: 'Implement core algorithm', status: 'in-progress' },
      { id: 'step-3', title: 'Run tests and verify build', status: 'pending' },
    ],
  };

  it('renders nothing when plan is null or empty', () => {
    const { container: c1 } = render(<PlanPanel plan={null} />);
    expect(c1).toBeEmptyDOMElement();

    const { container: c2 } = render(
      <PlanPanel plan={{ version: 1, createdAt: Date.now(), items: [] }} />,
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders plan items, progress count, and custom title', () => {
    render(
      <PlanPanel
        plan={samplePlan}
        isRunning={true}
        title="Custom Agent Plan"
      />,
    );

    expect(screen.getByText('Custom Agent Plan')).toBeInTheDocument();
    expect(screen.getByText('1/3 completed')).toBeInTheDocument();
    expect(screen.getByText('Executing')).toBeInTheDocument();

    // Check item titles
    expect(screen.getByText('Inspect files in repository')).toBeInTheDocument();
    expect(screen.getByText('Implement core algorithm')).toBeInTheDocument();
    expect(screen.getByText('Run tests and verify build')).toBeInTheDocument();

    // Check item statuses
    expect(screen.getByText('done')).toBeInTheDocument();
    expect(screen.getByText('working')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows version pill when version > 1', () => {
    const replannedPlan: AgentPlan = {
      ...samplePlan,
      version: 2,
    };

    render(<PlanPanel plan={replannedPlan} />);
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('shows Completed badge when all items are done', () => {
    const completedPlan: AgentPlan = {
      version: 1,
      createdAt: Date.now(),
      items: [
        { id: '1', title: 'Task A', status: 'done' },
        { id: '2', title: 'Task B', status: 'done' },
      ],
    };

    render(<PlanPanel plan={completedPlan} isRunning={false} />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('2/2 completed')).toBeInTheDocument();
  });

  it('collapses and expands when toggle button is clicked', () => {
    render(<PlanPanel plan={samplePlan} defaultCollapsed={false} />);

    expect(screen.getByText('Inspect files in repository')).toBeInTheDocument();

    const toggleButton = screen.getByRole('button', { name: /collapse plan/i });
    fireEvent.click(toggleButton);

    // Items list is hidden
    expect(
      screen.queryByText('Inspect files in repository'),
    ).not.toBeInTheDocument();

    // Click again to expand
    const expandButton = screen.getByRole('button', { name: /expand plan/i });
    fireEvent.click(expandButton);
    expect(screen.getByText('Inspect files in repository')).toBeInTheDocument();
  });
});
