"use client";

/**
 * The phone menu (menus and account picks 2026-11-05, 2A): a CDS Drawer opened by the menu button in the nav's
 * actions (1024px and narrower). Your stuff first (or Log in / Sign up), then the five worlds as CDS Accordion rows:
 * the account's interests first and open, the others folded below, one tap away. Then Support, GS Pro, Merch and
 * Community. CDS Navbar's own phone menu is a flat list that can't fold (on the CascadeDS fix list), so it's off.
 */

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Accordion, Drawer } from "@empac/cascadeds";
import { IconMenu2 } from "@tabler/icons-react";
import type { NavItem, NavSection } from "@/components/layout/NavMenu";

export interface PhoneWorld { id: string; label: string; sections: NavSection[]; mine: boolean }

const noop = () => () => {};

function Links({ items, onGo }: { items: NavItem[]; onGo: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="phone-menu__links">
      {items.map((i) => (
        <li key={`${i.href}-${i.label}`}>
          <Link href={i.href} onClick={onGo} aria-current={pathname === i.href ? "page" : undefined}
            className={`phone-menu__link${i.highlight ? " phone-menu__link--upgrade" : ""}`}>
            {i.label}
            {i.detail && <span>{i.detail}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PhoneMenu({ you, worlds, extra }: { you: { heading: string; items: NavItem[] }; worlds: PhoneWorld[]; extra: NavSection[] }) {
  const [open, setOpen] = useState(false);
  // CDS Drawer leaves a closed drawer in the page (off-screen but focusable, on the CascadeDS fix list), and renders
  // differently on the server, so it mounts only while the menu is in use: in, then open a frame later so it slides;
  // closed, then gone once it has slid away.
  const [mounted, setMounted] = useState(false);
  // The first moments after mounting: the open sections fill in off-screen without unfolding (globals.css), so the
  // menu slides in already laid out instead of growing while it moves.
  const [settling, setSettling] = useState(false);
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const timer = useRef<number | undefined>(undefined);
  const show = () => {
    // Opening again while it's still sliding shut cancels the pending unmount, which used to take the reopened menu away.
    window.clearTimeout(timer.current);
    setMounted(true);
    setSettling(true);
    // Three frames off-screen: mount, the open sections render their links, then measure; then slide in.
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true))));
    timer.current = window.setTimeout(() => setSettling(false), 450);
  };
  const toggle = useRef<HTMLButtonElement>(null);
  // Focus goes back to the menu button, as it would from any dialog, without scrolling the page to it.
  const close = () => {
    window.clearTimeout(timer.current);
    setSettling(false);
    setOpen(false);
    timer.current = window.setTimeout(() => { setMounted(false); toggle.current?.focus({ preventScroll: true }); }, 320);
  };
  const mine = worlds.filter((w) => w.mine).map((w) => w.id);

  return (
    <>
      <button ref={toggle} type="button" className="gs-phone-toggle" aria-label="Menu" aria-expanded={open} onClick={show}>
        <IconMenu2 size={24} stroke={2} aria-hidden="true" />
      </button>
      {hydrated && mounted && (
        <Drawer open={open} onClose={close} position="right" title="Menu" className={`phone-menu${settling ? " phone-menu--settling" : ""}`}>
          <nav aria-label="Site" className="phone-menu__body">
            <section className="phone-menu__you" aria-label={you.heading}>
              <p className="phone-menu__heading">{you.heading}</p>
              <Links items={you.items} onGo={close} />
            </section>
            <Accordion
              // The account's interests arrive after the first paint; a new key lets their worlds open when they do.
              key={mine.join(".") || "none"}
              variant="flush"
              allowMultiple
              defaultOpenIds={mine}
              className="phone-menu__worlds"
              items={worlds.map((w) => ({
                id: w.id,
                title: w.label,
                description: w.mine ? "Yours" : undefined,
                content: (
                  <div className="phone-menu__world">
                    {w.sections.map((s, i) => (
                      <div key={s.heading ?? i}>
                        {s.heading && <p className="phone-menu__heading">{s.heading}</p>}
                        <Links items={s.items} onGo={close} />
                      </div>
                    ))}
                  </div>
                ),
              }))}
            />
            {extra.map((s) => (
              <section key={s.heading} className="phone-menu__extra" aria-label={s.heading}>
                {s.heading && <p className="phone-menu__heading">{s.heading}</p>}
                <Links items={s.items} onGo={close} />
              </section>
            ))}
          </nav>
        </Drawer>
      )}
    </>
  );
}
