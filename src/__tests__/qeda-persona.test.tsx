import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { QedaPersona } from '@/components/ai-elements/qeda-persona';

describe('QedaPersona', () => {
  beforeAll(() => {
    window.matchMedia = jest.fn().mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        }) as MediaQueryList,
    );
  });

  it('renders the Qeda mark with an accessible state label', () => {
    const { rerender } = render(<QedaPersona state="thinking" />);

    expect(
      screen.getByRole('img', { name: 'Qeda assistant, thinking' }),
    ).toBeInTheDocument();

    rerender(<QedaPersona state="asleep" />);

    expect(
      screen.getByRole('img', { name: 'Qeda assistant, inactive' }),
    ).toBeInTheDocument();
  });
});
