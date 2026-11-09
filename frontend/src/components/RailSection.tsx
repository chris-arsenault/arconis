import type { ReactNode, SyntheticEvent } from "react";

/**
 * One collapsible section of the left rail: every secondary panel opens and closes the same way,
 * from the same header, with a count beside the title when the panel lists things.
 */
export function RailSection({
  id,
  title,
  count = 0,
  open,
  onToggle,
  className = "",
  children,
}: Readonly<{
  id: string;
  title: string;
  count?: number;
  open: boolean;
  onToggle: (id: string, open: boolean) => void;
  className?: string;
  children: ReactNode;
}>) {
  const toggled = (event: SyntheticEvent<HTMLDetailsElement>) =>
    onToggle(id, event.currentTarget.open);
  return (
    <details
      className={`rail-section ${className}`.trim()}
      open={open}
      onToggle={toggled}
      aria-label={title}
    >
      <summary className="rail-summary">
        <span className="rail-title">{title}</span>
        {count > 0 && <span className="rail-count">{count}</span>}
      </summary>
      <div className="rail-body">{children}</div>
    </details>
  );
}
