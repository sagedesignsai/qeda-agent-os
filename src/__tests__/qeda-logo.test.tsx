/**
 * __tests__/qeda-logo.test.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for QedaLogo and QedaLogomark components.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { QedaLogo, QedaLogomark } from '../components/QedaLogo';

describe('QedaLogo and QedaLogomark', () => {
  it('renders the logomark svg with default accessibility attributes', () => {
    render(<QedaLogomark />);
    const svg = screen.getByRole('img', { name: /Qeda Logomark/i });
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('viewBox', '0 0 70.891411 91.762123');
  });

  it('renders the full logo with name and default subtitle', () => {
    render(<QedaLogo variant="full" />);
    expect(screen.getByRole('banner', { name: /Qeda/i })).toBeInTheDocument();
    expect(screen.getByText('Qeda')).toBeInTheDocument();
    expect(screen.getByText('Agent OS')).toBeInTheDocument();
  });

  it('renders wordmark only when requested', () => {
    render(<QedaLogo variant="wordmark" subtitle="Custom Subtitle" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Qeda')).toBeInTheDocument();
    expect(screen.getByText('Custom Subtitle')).toBeInTheDocument();
  });

  it('supports hiding the subtitle', () => {
    render(<QedaLogo hideSubtitle />);
    expect(screen.getByText('Qeda')).toBeInTheDocument();
    expect(screen.queryByText('Agent OS')).not.toBeInTheDocument();
  });

  it('applies custom ring and bolt classes and colors', () => {
    const { container } = render(
      <QedaLogomark
        ringColor="#ffffff"
        boltColor="#38bdf8"
        ringClassName="custom-ring"
        boltClassName="custom-bolt"
      />,
    );
    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[0]).toHaveAttribute('fill', '#ffffff');
    expect(paths[0]).toHaveClass('custom-ring');
    expect(paths[1]).toHaveAttribute('fill', '#38bdf8');
    expect(paths[1]).toHaveClass('custom-bolt');
  });
});
