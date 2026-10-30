/**
 * __tests__/motion-browser.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Exercises the Motion browser's empty state and create-to-editor handoff.
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import MotionBrowser from '@/renderer/pages/MotionBrowser';

const navigateMock = jest.fn();
const invokeMock = jest.fn();

jest.mock('react-router', () => ({
  ...jest.requireActual('react-router'),
  useNavigate: () => navigateMock,
}));

jest.mock('@/components/PageHeader', () => ({ PageHeader: () => <header /> }));

describe('Motion browser', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    invokeMock.mockReset();
    invokeMock.mockImplementation((channel: string) => {
      if (channel === 'motion:list-projects') return Promise.resolve({ projects: [] });
      if (channel === 'motion:create-project') return Promise.resolve({ projectId: 'prj_new', path: '/hidden' });
      return Promise.resolve(undefined);
    });
    (window as unknown as { electron: unknown }).electron = { ipc: { invoke: invokeMock, on: () => () => {} } };
  });

  it('creates a blank project and opens its editor only after IPC succeeds', async () => {
    render(<MemoryRouter><MotionBrowser /></MemoryRouter>);
    expect(await screen.findByText('Your first scene starts here')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start blank' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Phone launch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('motion:create-project', { name: 'Phone launch', blank: true }));
    expect(navigateMock).toHaveBeenCalledWith('/motion/prj_new');
  });

  it('creates the selected template through the project IPC contract', async () => {
    render(<MemoryRouter><MotionBrowser /></MemoryRouter>);
    await screen.findByText('Your first scene starts here');
    fireEvent.click(screen.getByRole('button', { name: 'Start from a template' }));
    fireEvent.click(screen.getByRole('button', { name: /Social loop/ }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Launch loop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('motion:create-project', {
      name: 'Launch loop', templateId: 'social-loop',
    }));
    expect(navigateMock).toHaveBeenCalledWith('/motion/prj_new');
  });
});
