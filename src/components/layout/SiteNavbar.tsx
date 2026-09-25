"use client";

import { useEffect, useRef, useState } from "react";
import { Navbar } from "@empac/cascadeds";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/auth/UserMenu";
import { CommsIcons } from "@/components/social/CommsIcons";
import { NavMenu, type NavItem, type NavSection } from "@/components/layout/NavMenu";
import { PILLARS, primaryItems, type Pillar } from "@/lib/nav/pillars";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

/**
 * Top-level site nav. This is the CDS `Navbar` (it still renders the logo,
 * links, actions, and the mobile toggle/menu) wrapped in a thin scroll "shell"
 * that drives a customized presentation via CSS:
 *   - hero routes  → two frosted glass "pills" (links + actions) floating over
 *                    the hero; hide on scroll-down / reveal on scroll-up
 *   - other routes → a plain solid brand bar
 * The pills + float + scroll behavior are CSS on the CDS parts, not a fork of
 * the component.
 *
 * IA: two intent dropdowns — **Play** (public player surfaces) and **Stream**.
 * Stream is public (a conversion path for prospective streamers): it leads with
 * the GS Pro pitch + Streamer Beta for everyone, and *appends* the account-gated
 * workspace (Hub / Twitch) only once you actually have a streamer integration —
 * so prospects get the sell and streamers get their tools. See the Nav IA proposal.
 */
/** Routes that render a full-bleed hero at the very top — the nav floats over
 *  these as frosted pills (dark translucent, so white text reads over light
 *  aurora heroes and dark image/video heroes alike), then pins on scroll. All
 *  forward-facing marketing + app/tool landing pages, for one consistent nav. */
const HERO_ROUTES = new Set([
  "/",
  "/apps",
  "/tools",
  "/features",
  "/gs-pro",
  "/beta",
  "/for-streamers",
  "/for-streamers/current",
  "/for-streamers/aspiring",
  "/for-organizers",
  "/gs-circuit",
  "/contact-us",
  "/pokemon-tcg",
  "/game-nights",
  "/tournament",
  "/mario-kart-8-deluxe-randomizer",
  "/mario-kart-world-randomizer",
  "/competitive-mario-kart",
  "/mario-kart-tournaments",
  "/pokemon-tcg-companion",
  "/randomizers/mario-kart-8-deluxe",
  "/randomizers/mario-kart-world",
]);

/** Detail routes that lead with a full-bleed hero but cannot be listed in
 *  HERO_ROUTES because the id is dynamic. Only the bare detail page qualifies —
 *  `/game-nights/create` and `/tournament/<id>/manage` are ordinary pages. */
const HERO_DETAIL: { prefix: string; notIds: Set<string> }[] = [
  { prefix: "/game-nights/", notIds: new Set(["create", "tools"]) },
  { prefix: "/tournament/", notIds: new Set(["create", "sandbox", "championship"]) },
];

function isHeroPath(pathname: string): boolean {
  if (HERO_ROUTES.has(pathname)) return true;
  for (const { prefix, notIds } of HERO_DETAIL) {
    if (!pathname.startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length);
    // Exactly one segment, and not one of the non-detail pages.
    if (rest && !rest.includes("/") && !notIds.has(rest)) return true;
  }
  return false;
}

export function SiteNavbar() {
  const { user } = useAuth();
  const pathname = usePathname();
  // Event detail pages open on a hero image. They were rendering the 64px nav
  // spacer instead, so the artwork started below a white band — and when the
  // nav hid on scroll-down that band was left empty, which read as broken.
  const isHeroPage = isHeroPath(pathname);

  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // "Armed" = the nav has been revealed while already past the hero, so a
  // subsequent hide should animate (slide up). The very first hide when
  // crossing the hero threshold stays instant to avoid a flash. Disarms back
  // at the top. All setState below runs in the scroll callback, not the body.
  const [armed, setArmed] = useState(false);
  const lastY = useRef(0);

  // The Stream workspace dropdown only appears for actual streamers (a Twitch
  // integration row), so we never show account-gated dashboards to the public.
  const [isStreamer, setIsStreamer] = useState(false);
  // Whether the account already pays, so the upgrade row and the Go Pro button
  // disappear once they have. Fetched alongside the streamer check rather than
  // in a second effect — the nav should cost one round trip, not two.
  const [isPaid, setIsPaid] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // Defer so the reset lands in a callback, not the effect body.
      const id = requestAnimationFrame(() => {
        if (!cancelled) { setIsStreamer(false); setIsPaid(false); }
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(id);
      };
    }
    const supabase = createClient();
    void Promise.all([
      supabase.from("twitch_connections").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("users").select("subscription_tier, role, circuit_status").eq("id", user.id).maybeSingle(),
    ]).then(([tw, u]) => {
      if (cancelled) return;
      setIsStreamer(!!tw.data);
      const row = u.data as { subscription_tier?: string | null; role?: string | null; circuit_status?: string | null } | null;
      // Staff read as paid too — showing them an upgrade prompt is noise.
      const paidPro = effectiveTier({ tier: normalizeTier(row?.subscription_tier), role: row?.role ?? null }) !== "free";
      const paidCircuit = !!row?.circuit_status && ["active", "trialing", "past_due"].includes(row.circuit_status);
      setIsPaid(paidPro || paidCircuit);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    lastY.current = 0;
    const onScroll = () => {
      const y = window.scrollY;
      // On hero pages the "solid" state kicks in after most of the hero;
      // elsewhere as soon as you leave the very top.
      const threshold = isHeroPage ? Math.max(140, window.innerHeight * 0.36) : 8;
      setScrolled(y > threshold);
      if (y <= threshold) {
        setHidden(false);
        setArmed(false);
      } else if (y > lastY.current + 4) {
        setHidden(true);
      } else if (y < lastY.current - 4) {
        setHidden(false);
        setArmed(true);
      }
      lastY.current = y;
    };
    // Defer the initial sync so state updates land in a callback (re-runs per
    // route to reset the hidden/scrolled state for the new page).
    const raf = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname, isHeroPage]);

  // Nav groups come from the pillar map so the nav, footer, homepage and
  // sitemap cannot drift apart. The pillar was renamed Organize -> Compete:
  // far more people want to ENTER a tournament than run one, so it is named
  // for the majority intent and organising is an action inside it.
  const navCtx = { signedIn: !!user, isStreamer, isStaff: false };
  const pillarSections = (p: Pillar): NavSection[] => {
    const groups = primaryItems(p, navCtx);
    const sections: NavSection[] = groups.map((g) => ({
      // Heading only when there is more than one group LEFT — a pillar whose
      // other groups were all filtered out does not need a heading above its
      // own name.
      heading: groups.length > 1 ? g.heading : undefined,
      items: g.items.map((i) => ({ label: i.label, href: i.href })),
    }));
    // Paid sits INSIDE the pillar it extends rather than in a nav bucket of its
    // own: Circuit under Compete, Pro under Stream. A single "pricing" bucket
    // would also force a streamer past organizer pricing to reach theirs.
    // Hidden once the account already pays — nobody needs selling twice.
    if (p.upgrade && !isPaid && sections.length > 0) {
      sections[sections.length - 1].items.push({
        label: p.upgrade.label,
        href: p.upgrade.href,
        highlight: true,
        detail: p.upgrade.blurb,
      });
    }
    return sections;
  };

  // Auth links are appended so they show in the CDS mobile menu (CDS renders
  // the mobile menu from `links`); on desktop we render our own dropdowns in the
  // logo slot and hide CDS's desktop links group via CSS. Signed-out users
  // always get both Log In + Sign up so they're reachable from the hamburger.
  const authLinks = user
    ? [{ label: "Account", href: "/account" }]
    : [
        { label: "Log In", href: "/login" },
        { label: "Sign up", href: "/signup" },
      ];

  // Mobile hamburger: CDS renders a FLAT link list with no group support, so we
  // interleave non-navigating header rows (sentinel href, styled + made inert in
  // CSS) to give the flat list real sections. See [href="#nav-hdr"] in globals.css.
  const hdr = (label: string): NavItem => ({ label, href: "#nav-hdr" });
  const links: NavItem[] = [
    // Account first so it's immediately reachable (not buried under ~20 items),
    // and Sign up stays high for conversion.
    hdr("Account"),
    ...authLinks,
    ...PILLARS.flatMap((p) => [
      hdr(p.label),
      ...primaryItems(p, navCtx).flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href }))),
    ]),
  ];

  const floating = isHeroPage && !scrolled;
  const shellClass = [
    "gs-nav-shell",
    isHeroPage ? "gs-nav-shell--hero" : "gs-nav-shell--plain",
    floating ? "gs-nav-shell--float" : "gs-nav-shell--solid",
    hidden ? "gs-nav-shell--hidden" : "",
    armed ? "gs-nav-shell--armed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className={shellClass}>
        <Navbar
          logo={
            <span className="gs-nav__primary">
              <Link href="/" className="gs-nav__brand" aria-label="GameShuffle home">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/fg/logos/gameshuffle-wht.svg"
                  alt="GameShuffle"
                  width={158}
                  height={22}
                  style={{ height: "auto" }}
                />
              </Link>
              <span className="gs-nav__links">
                {PILLARS.map((p) => (
                  <NavMenu key={p.id} label={p.label} sections={pillarSections(p)} pathname={pathname} />
                ))}
              </span>
            </span>
          }
          links={links}
          actions={
            <>
              {/* Comms (bell + chat) are signed-in only — rendering the wrapper
                  when signed out left an empty span whose flex gap pushed a
                  hollow space to the left of the auth buttons. */}
              {user && (
                <span className="navbar-comms">
                  <CommsIcons />
                </span>
              )}
              {/* Paid gets a standing affordance rather than a nav bucket: a
                  pricing page is not a destination people seek out, it is a
                  thing they want when they hit a wall. Signed-in free accounts
                  only — a signed-out visitor cannot buy Pro without an account,
                  so this would just compete with Sign up, and /gs-pro is
                  already the Stream pillar's own entry. */}
              {user && !isPaid && (
                <Link href="/gs-pro" className="gs-nav__upgrade">
                  Go Pro
                </Link>
              )}
              <span className="navbar-usermenu">
                <UserMenu />
              </span>
            </>
          }
        />
      </div>

      {/* Non-hero pages: the nav is fixed, so reserve its height in flow. Hero
          pages intentionally let the hero sit under the floating pills. */}
      {!isHeroPage && <div className="gs-nav__spacer" aria-hidden />}
    </>
  );
}
