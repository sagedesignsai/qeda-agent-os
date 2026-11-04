/**
 * __tests__/motion-add-node-dialog.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for MotionAddNodeDialog. Verifies category filtering, search,
 * prop configuration, parent selection, and node insertion via Motion ops.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';

import { MotionAddNodeDialog } from '@/components/motion/MotionAddNodeDialog';
import { motionStore } from '@/hooks/use-motion-store';
import { createStarterMotionDocument } from '@/lib/motion/defaults';

beforeAll(() => {
  window.electron = {
    ipc: {
      invoke: jest.fn().mockResolvedValue({ items: [], errors: [] }),
      on: jest.fn().mockReturnValue(() => {}),
    },
  } as unknown as typeof window.electron;

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverMock,
  });
});

describe('MotionAddNodeDialog', () => {
  const onClose = jest.fn();

  beforeEach(() => {
    onClose.mockClear();
    motionStore.loadDocument(
      createStarterMotionDocument('2026-01-01T00:00:00.000Z'),
    );
  });

  it('renders categories and filters node list by search input', () => {
    render(
      <MotionAddNodeDialog
        onClose={onClose}
        assets={[]}
        projectId="prj_test1"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Add Node' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Devices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Surfaces & Text' })).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('Search nodes…');
    fireEvent.change(searchInput, { target: { value: 'phone' } });

    expect(screen.getByRole('option', { name: /Phone/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Ambient light/ })).not.toBeInTheDocument();
  });

  it('configures and inserts a new node into the document', () => {
    render(
      <MotionAddNodeDialog
        onClose={onClose}
        assets={[]}
        projectId="prj_test1"
      />,
    );

    // Select the Phone node type
    const phoneOption = screen.getByRole('option', { name: /Phone/ });
    fireEvent.click(phoneOption);

    // Verify name field is pre-filled and can be changed
    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toHaveValue('Phone');
    fireEvent.change(nameInput, { target: { value: 'Hero Phone' } });

    // Click "Insert Node"
    const insertBtn = screen.getByRole('button', { name: 'Insert Node' });
    expect(insertBtn).toBeEnabled();
    fireEvent.click(insertBtn);

    // Verify the node was committed to the document
    const doc = motionStore.getDocument();
    const heroNode = doc.scene.nodes.find((n) => n.name === 'Hero Phone');
    expect(heroNode).toBeDefined();
    expect(heroNode?.type).toBe('device.phone');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when Cancel is clicked or Escape is pressed', () => {
    render(
      <MotionAddNodeDialog
        onClose={onClose}
        assets={[]}
        projectId="prj_test1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();

    onClose.mockClear();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
