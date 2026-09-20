import type { ReactNode } from "react";

/** Shared shell for the route and GPS page headers. Both used to be a loose
 *  stack of <p> tags — one per link — which left the save button, the two
 *  outbound links and the timestamp on four separate lines. */
export function RouteHeader({
  title,
  chips,
  actions,
  children,
}: {
  title: ReactNode;
  chips: (string | null | undefined)[];
  actions: ReactNode;
  children?: ReactNode;
}) {
  const shown = chips.filter((c): c is string => Boolean(c && c.trim()));
  return (
    <header className="route-header">
      {title}
      {shown.length > 0 && (
        <p className="route-chips">
          {shown.map(c => (
            <span key={c} className="route-chip">{c}</span>
          ))}
        </p>
      )}
      <div className="route-actions">{actions}</div>
      {children}
    </header>
  );
}
