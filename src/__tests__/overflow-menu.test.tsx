/**
 * __tests__/overflow-menu.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Verifies the page-header overflow collapse: it renders nothing when a screen
 * has no surplus commands, and it renders the labelled trigger when it does.
 *
 * The dropdown's open/close behaviour is Radix's, not ours, so it is not
 * re-tested here — only the two decisions this component owns.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { OverflowMenu } from '@/components/OverflowMenu';

describe('OverflowMenu', () => {
  it('renders no affordance when there is nothing to collapse', () => {
    render(<OverflowMenu label="More task actions" items={[]} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders an icon trigger with an accessible name', () => {
    render(
      <OverflowMenu
        label="More studio actions"
        items={[{ label: 'AI Director', onSelect: () => {} }]}
      />,
    );

    const trigger = screen.getByRole('button', { name: 'More studio actions' });
    expect(trigger).toBeInTheDocument();
    // Collapsed by default — the menu body is not in the tree until opened.
    expect(screen.queryByText('AI Director')).toBeNull();
  });
});
