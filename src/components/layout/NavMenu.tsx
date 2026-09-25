"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@empac/cascadeds";

export interface NavItem {
  label: string;
  href: string;
  /** The paid product that extends this pillar. Rendered with weight and a
   *  separator so it reads as an upgrade rather than another destination —
   *  paid is elevated INSIDE its pillar instead of getting a nav bucket. */
  highlight?: boolean;
  /** Secondary line, used by the highlighted upgrade row. */
  detail?: string;
}

export interface NavSection {
  heading?: string;
  items: NavItem[];
}

/**
 * A top-nav dropdown (Play / Stream). Opens on hover (desktop) and click,
 * closes on outside-click, Escape, or route change. Supports multi-column
 * "mega" panels via sections (Play uses Games + Free Tools).
 *
 * SEO: the panel is ALWAYS in the DOM (hidden when closed), so every menu link
 * is real, crawlable server HTML — not conditionally rendered on open. This is
 * what puts the free-tool keyword pages into the site's internal link graph.
 */
export function NavMenu({
  label,
  sections,
  pathname,
}: {
  label: string;
  sections: NavSection[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  const active = sections.some((s) =>
    s.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );
  const mega = sections.length > 1;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const openNow = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      className={`gs-navmenu${active ? " is-active" : ""}${open ? " is-open" : ""}`}
      ref={ref}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <button
        type="button"
        className="gs-navmenu__trigger"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <Icon name="chevron-down" size="16" stroke={2.5} className="gs-navmenu__car" aria-hidden="true" />
      </button>
      {/* Always rendered (hidden when closed) so links are in the server HTML. */}
      <div
        className={`gs-navmenu__panel dark${mega ? " gs-navmenu__panel--mega" : ""}`}
        role="menu"
        hidden={!open}
      >
        {sections.map((section, si) => (
          <div className="gs-navmenu__col" key={section.heading ?? si}>
            {section.heading && <p className="gs-navmenu__heading">{section.heading}</p>}
            {section.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                className={`gs-navmenu__item${pathname === it.href ? " is-active" : ""}${it.highlight ? " gs-navmenu__item--upgrade" : ""}`}
                onClick={() => setOpen(false)}
              >
                {it.label}
                {it.detail && <span className="gs-navmenu__item-detail">{it.detail}</span>}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
