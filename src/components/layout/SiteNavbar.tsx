"use client";

import { useEffect, useRef, useState } from "react";
import { Navbar } from "@empac/cascadeds";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/auth/UserMenu";
import { CommsIcons } from "@/components/social/CommsIcons";
import { NavMenu, type NavItem, type NavSection } from "@/components/layout/NavMenu";
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
// Play column 1 — the games. Randomizers, the TCG companion, and the Mario Kart
// competitive lounge. (Tournaments, Game Nights, and the social surfaces
// have their own top-level menus now.)
const GAMES_ITEMS: NavItem[] = [
  { label: "MK8 Deluxe Randomizer", href: "/randomizers/mario-kart-8-deluxe" },
  { label: "Mario Kart World Randomizer", href: "/randomizers/mario-kart-world" },
  { label: "TCG Companion App", href: "/pokemon-tcg" },
  { label: "Mario Kart Lounge", href: "/competitive/mario-kart-8-deluxe" },
];
// Play column 2 — the free tools. Each is a keyword-ranking SEO page, so they
// live in the nav as real crawlable links (the panel renders server-side).
const TOOLS_ITEMS: NavItem[] = [
  { label: "Wheel Spinner", href: "/wheel-spinner" },
  { label: "Dice Roller", href: "/dice-roller" },
  { label: "Coin Flip", href: "/coin-flip" },
  { label: "Name Picker", href: "/name-picker" },
  { label: "Tier List Maker", href: "/tier-list-maker" },
  { label: "Bingo Generator", href: "/bingo-card-generator" },
  { label: "Magic 8-Ball", href: "/magic-8-ball" },
  { label: "Stream Timer", href: "/stream-timer" },
  { label: "Truth or Dare", href: "/truth-or-dare" },
  { label: "Yes / No", href: "/yes-no" },
  { label: "All free tools", href: "/tools" },
];
// Public streamer marketing — the conversion path for anyone considering
// GameShuffle as their streaming platform. Leads with the Pro pitch.
const STREAM_PUBLIC: NavItem[] = [
  { label: "GameShuffle Pro", href: "/gs-pro" },
  { label: "For New Streamers", href: "/for-streamers/aspiring" },
  { label: "For Current Streamers", href: "/for-streamers/current" },
  { label: "Streamer Beta", href: "/beta" },
];
// Streamer workspace — the actual dashboards, appended only for streamers.
const STREAM_WORKSPACE: NavItem[] = [
  { label: "Stream Hub", href: "/hub" },
  { label: "Twitch Integration", href: "/twitch" },
];

// Tournaments — action first (create / browse), then the Circuit plan + the
// organizer marketing pitch.
const ORGANIZE_ITEMS: NavItem[] = [
  { label: "Create Tournament", href: "/tournament/create" },
  { label: "Browse Tournaments", href: "/tournament" },
  { label: "GameShuffle Circuit", href: "/gs-circuit" },
  { label: "For Organizers", href: "/for-organizers" },
];

// Community — the social layer: the hub feed, game nights, and player
// discovery.
const COMMUNITY_ITEMS: NavItem[] = [
  { label: "Community Hub", href: "/communities" },
  { label: "Game Nights", href: "/game-nights" },
  { label: "Find Players", href: "/players" },
];

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
  "/mario-kart-8-deluxe-randomizer",
  "/mario-kart-world-randomizer",
  "/competitive-mario-kart",
  "/mario-kart-tournaments",
  "/pokemon-tcg-companion",
  "/randomizers/mario-kart-8-deluxe",
  "/randomizers/mario-kart-world",
]);

export function SiteNavbar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const isHeroPage = HERO_ROUTES.has(pathname);

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
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // Defer so the reset lands in a callback, not the effect body.
      const id = requestAnimationFrame(() => {
        if (!cancelled) setIsStreamer(false);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(id);
      };
    }
    const supabase = createClient();
    supabase
      .from("twitch_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsStreamer(!!data);
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

  const playSections: NavSection[] = [
    { heading: "Games", items: GAMES_ITEMS },
    { heading: "Free Tools", items: TOOLS_ITEMS },
  ];
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
  // Stream = public marketing for everyone, + the workspace once you're a streamer.
  const streamItems = isStreamer
    ? [...STREAM_PUBLIC, ...STREAM_WORKSPACE]
    : STREAM_PUBLIC;
  const streamSections: NavSection[] = [{ items: streamItems }];
  const organizeSections: NavSection[] = [{ items: ORGANIZE_ITEMS }];
  const communitySections: NavSection[] = [{ items: COMMUNITY_ITEMS }];
  // Mobile hamburger: CDS renders a FLAT link list with no group support, so we
  // interleave non-navigating header rows (sentinel href, styled + made inert in
  // CSS) to give the flat list real sections — Games / Free Tools / Stream /
  // Account. See the [href="#nav-hdr"] rule in globals.css.
  const hdr = (label: string): NavItem => ({ label, href: "#nav-hdr" });
  const links: NavItem[] = [
    // Account first so it's immediately reachable (not buried under ~20 items),
    // and Sign up stays high for conversion.
    hdr("Account"),
    ...authLinks,
    hdr("Games"),
    ...GAMES_ITEMS,
    hdr("Free Tools"),
    ...TOOLS_ITEMS,
    hdr("Stream"),
    ...streamItems,
    hdr("Tournaments"),
    ...ORGANIZE_ITEMS,
    hdr("Community"),
    ...COMMUNITY_ITEMS,
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
                <Image
                  src="/images/fg/logos/gameshuggle-wht.png"
                  alt="GameShuffle"
                  width={150}
                  height={40}
                  style={{ height: "auto" }}
                  priority
                />
              </Link>
              <span className="gs-nav__links">
                <NavMenu label="Play" sections={playSections} pathname={pathname} />
                <NavMenu label="Stream" sections={streamSections} pathname={pathname} />
                <NavMenu label="Tournaments" sections={organizeSections} pathname={pathname} />
                <NavMenu label="Community" sections={communitySections} pathname={pathname} />
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
