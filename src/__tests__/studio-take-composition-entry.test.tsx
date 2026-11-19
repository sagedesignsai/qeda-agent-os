import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import StudioTakeCompositionEntry from '../renderer/pages/StudioTakeCompositionEntry';

function CompositionDestination() {
  const { compositionId } = useParams<{ compositionId: string }>();
  return <h1>Composition {compositionId}</h1>;
}

describe('StudioTakeCompositionEntry', () => {
  beforeEach(() => {
    window.electron = {
      ipc: {
        invoke: jest.fn().mockResolvedValue({ id: 'stable-composition' }),
      },
    } as unknown as typeof window.electron;
  });

  it('opens the stable default composition for a recording', async () => {
    render(
      <MemoryRouter initialEntries={['/studio/take-123']}>
        <Routes>
          <Route
            path="/studio/:takeId"
            element={<StudioTakeCompositionEntry />}
          />
          <Route
            path="/studio/compositions/:compositionId"
            element={<CompositionDestination />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Composition stable-composition',
      }),
    ).toBeInTheDocument();
    expect(window.electron.ipc.invoke).toHaveBeenCalledWith(
      'studio:composition-default-for-take',
      { takeId: 'take-123' },
    );
  });
});
