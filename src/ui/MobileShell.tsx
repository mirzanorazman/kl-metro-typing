import type { ReactNode } from 'react';
import { useVisualViewport } from './useVisualViewport';
import './mobile.css';

export type MobileDestination = 'transit' | 'adventure' | 'ranking';

interface MobileShellProps {
  active: MobileDestination;
  onNavigate: (destination: MobileDestination) => void;
  children: ReactNode;
}

const destinations: ReadonlyArray<{
  destination: MobileDestination;
  label: string;
}> = [
  { destination: 'transit', label: 'Transit' },
  { destination: 'adventure', label: 'Adventure' },
  { destination: 'ranking', label: 'Ranking' },
];

export function MobileShell({ active, onNavigate, children }: MobileShellProps) {
  const { height } = useVisualViewport();

  return (
    <div className="mobile-shell" style={{ height: `${height}px` }}>
      <header className="mobile-header">KL-Metro Typing</header>
      <div className="mobile-destination">{children}</div>
      <nav className="mobile-bottom-nav" aria-label="Primary">
        {destinations.map(({ destination, label }) => (
          <button
            key={destination}
            type="button"
            aria-current={active === destination ? 'page' : undefined}
            onClick={() => onNavigate(destination)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
