import { useState, type ReactNode } from 'react';
import './mobile.css';

interface MobileDrawerProps {
  title: string;
  subtitle: string;
  initiallyExpanded?: boolean;
  children: ReactNode;
}

export function MobileDrawer({
  title,
  subtitle,
  initiallyExpanded = true,
  children,
}: MobileDrawerProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  return (
    <section className="mobile-drawer" data-expanded={expanded}>
      <button
        type="button"
        className="mobile-drawer-toggle"
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse setup' : 'Expand setup'}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="mobile-drawer-labels">
          <span className="mobile-drawer-title">{title}</span>
          <span className="mobile-drawer-subtitle">{subtitle}</span>
        </span>
        <span className="mobile-drawer-chevron" aria-hidden="true">
          {expanded ? '⌃' : '⌄'}
        </span>
      </button>
      {expanded && <div className="mobile-drawer-content">{children}</div>}
    </section>
  );
}
