"use client";

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
 *   AdminScreen  the card a screen sits in (older cards inside become sections)
 *   SaveStatus   "Saving… / Saved" for autosaving screens (useAutosave)
 *   AdminField   a label tied to its control, with helper or error text below
 */

import { useId, type ReactNode } from "react";
import { Dropdown, IconButton, type DropdownMenuItem } from "@empac/cascadeds";
import { IconAlertTriangle, IconCheck, IconDots, IconLoader2 } from "@tabler/icons-react";
import type { AutosaveStatus } from "@/lib/hooks/useAutosave";

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

/** One screen: a header, then its sections. Older self-contained cards placed
 *  inside render as sections (styles in account.css), never a card in a card. */
export function AdminScreen({ title, intro, actions, className, children }: { title: string; intro?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`account-card admin-screen${className ? ` ${className}` : ""}`}>
      <AdminHeader title={title} intro={intro} actions={actions} />
      {children}
    </div>
  );
}

const SAVE_TEXT: Record<AutosaveStatus, string> = {
  idle: "Changes save automatically",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save. Check the fields and try again.",
};

export function SaveStatus({ status }: { status: AutosaveStatus }) {
  const Icon = status === "saving" ? IconLoader2 : status === "error" ? IconAlertTriangle : IconCheck;
  return (
    <span className={`save-status save-status--${status}`} role="status" aria-live="polite">
      <Icon size={16} aria-hidden />
      {SAVE_TEXT[status]}
    </span>
  );
}

/** A label tied to its control (htmlFor/id), with helper or error text that
 *  the control points at. Render the control with the id and describedBy. */
export function AdminField({ label, helper, error, children }: {
  label: ReactNode;
  helper?: ReactNode;
  error?: string | null;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || helper;
  return (
    <div className="admin-field">
      <label htmlFor={id} className="admin-field__label">{label}</label>
      {children(id, note ? noteId : undefined)}
      {error ? <p id={noteId} className="admin-field__error">{error}</p> : helper ? <p id={noteId} className="admin-field__help">{helper}</p> : null}
    </div>
  );
}
