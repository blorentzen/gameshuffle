/**
 * The Platform admin kit: the few layout pieces every admin screen shares, so
 * screens stop inventing their own. All CDS underneath; this only arranges it.
 *
 *   AdminHeader  title (the page's h1), one plain sentence, actions on the right
 *   AdminStats   a grid of CDS StatCards: 2 across on phones, 4 on desktop
 *   AdminSection a titled block inside a screen (optional icon tile)
 *   AdminPanel   a bordered block inside a section
 *   AdminTable   a full-width CDS Table that scrolls sideways on its own,
 *                reachable by keyboard (a scroll region needs a tab stop)
 *   AdminRowMenu a row's "more" menu (Archive, Delete…) so a table isn't a
 *                column of red buttons; the action itself still confirms
 *   AdminUpdated "Updated 1:48 PM" footnote for screens that refresh
 */

import type { ReactNode } from "react";
import { Dropdown, IconButton, type DropdownMenuItem } from "@empac/cascadeds";
import { IconDots } from "@tabler/icons-react";

export function AdminHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="admin-head">
      <div className="admin-head__text">
        <h1 className="admin-head__title">{title}</h1>
        {intro && <p className="admin-head__intro">{intro}</p>}
      </div>
      {actions && <div className="admin-head__actions">{actions}</div>}
    </header>
  );
}

/** `columns` is the desktop count; pick one the cards fill (3 or 4). */
export function AdminStats({ children, columns = 4, label }: { children: ReactNode; columns?: 3 | 4; label?: string }) {
  return (
    <div className="admin-stats-wrap">
      <div className={`admin-stats-grid admin-stats-grid--${columns}`} role={label ? "group" : undefined} aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function AdminSection({ title, intro, actions, icon, iconTone, children }: { title: string; intro?: ReactNode; actions?: ReactNode; icon?: ReactNode; iconTone?: "accent"; children: ReactNode }) {
  return (
    <section className="admin-section">
      <div className="admin-section__head">
        {icon && <span className={`admin-section__icon${iconTone ? ` admin-section__icon--${iconTone}` : ""}`} aria-hidden>{icon}</span>}
        <h2 className="admin-section__title">{title}</h2>
        {actions && <div className="admin-section__actions">{actions}</div>}
      </div>
      {intro && <p className="admin-section__intro">{intro}</p>}
      {children}
    </section>
  );
}

/** A bordered block inside a section (a short list, a summary, a small form). */
export function AdminPanel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`admin-panel${className ? ` ${className}` : ""}`}>
      {title && <h3 className="admin-panel__title">{title}</h3>}
      {children}
    </div>
  );
}

export function AdminTable({ label, children }: { label: string; children: ReactNode }) {
  return <div className="admin-table" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

export function AdminRowMenu({ label, items }: { label: string; items: DropdownMenuItem[] }) {
  return (
    <Dropdown
      align="end"
      className="admin-row-menu"
      trigger={<IconButton variant="tertiary" size="small" aria-label={label} aria-haspopup="menu"><IconDots size={18} aria-hidden /></IconButton>}
      items={items}
    />
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function AdminUpdated({ at, every }: { at: string; every?: string }) {
  return <p className="admin-updated">Updated {time(at)} Pacific{every ? ` · refreshes every ${every}` : ""}</p>;
}
