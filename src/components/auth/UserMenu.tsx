"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Menu, type MenuSectionProps } from "@empac/cascadeds";
import { useAuth } from "./AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { useDisplayIdentity } from "@/lib/capabilities/useDisplayIdentity";
import { isStaffRole } from "@/lib/subscription";
import { ACCOUNT_SECTIONS } from "@/lib/account/nav";
import { IconHeart } from "@tabler/icons-react";

interface ProfileSnapshot {
  avatar_source: AvatarSource | string | null;
  avatar_seed: string | null;
  avatar_options: Record<string, string> | null;
  discord_avatar: string | null;
  twitch_avatar: string | null;
  role: string | null;
  display_name: string | null;
  username: string | null;
}

/**
 * Build the categorized menu sections per CDS Menu — Activity / Your account /
 * Community / Help / (signout). The Activity section only renders when the user has
 * a Twitch streamer integration, so non-streamers see a focused
 * account-only menu.
 */
function buildMenuSections(args: {
  router: ReturnType<typeof useRouter>;
  signOut: () => void | Promise<void>;
  setOpen: (open: boolean) => void;
  hasStreamerIntegration: boolean;
  isStaff: boolean;
  /** GS Ranked lounges the account plays in (asked when the menu opens). */
  hasLounges: boolean;
  /** What waits in the time trial review queue for a reviewer or updater (asked when the menu opens); null for anyone else. */
  reviews: number | null;
  /** Your handle, for your front window (your public profile). */
  username: string | null;
}): MenuSectionProps[] {
  const go = (path: string) => () => {
    args.setOpen(false);
    args.router.push(path);
  };
  const sections: MenuSectionProps[] = [];

  // Comms Center is reached via the navbar bell + messages icons, so it's not
  // duplicated here. Activity = Stream Hub (streamers only).
  const activity = [
    ...(args.hasStreamerIntegration ? [{ label: "Studio", onClick: go("/hub") }] : []),
    ...(args.hasLounges ? [{ label: "Your lounges", onClick: go("/ranked") }] : []),
    ...(args.reviews !== null ? [{ label: args.reviews ? `Time trial reviews (${args.reviews})` : "Time trial reviews", onClick: go("/time-trials/review") }] : []),
  ];
  if (activity.length) sections.push({ label: "Activity", items: activity });

  // Your account: its home, then every section (menus and account picks 2026-11-05), from the nav model so the menu
  // always matches the sidebar. Platform Admin is staff-only.
  // Your home (/home) and Settings first (journeys picks 2026-11-06), then the sections that still live in Account.
  sections.push({
    label: "Your account",
    items: [
      { label: "Home", onClick: go("/home") },
      // The home's header used to link here (home cleanup picks 2026-11-07, 1A); on phones the app bar's You opens it.
      ...(args.username ? [{ label: "Your front window", onClick: go(`/u/${args.username}`) }] : []),
      { label: "Settings", onClick: go("/settings") },
      ...ACCOUNT_SECTIONS.filter((s) => s.kind !== "you" && (!s.staffOnly || args.isStaff)).map((s) => ({
        label: s.label,
        onClick: go(`${s.route}?tab=${s.defaultTab}`),
      })),
    ],
  });

  // Community left the site menus (2026-11-05) for here and the footer.
  sections.push({
    label: "Community",
    items: [
      { label: "Communities", onClick: go("/communities") },
      { label: "Find players", onClick: go("/players") },
    ],
  });

  // Support GameShuffle (heart) and Help, apart so the two can't be mixed up (picks 2026-10-19).
  sections.push({
    items: [
      { label: "Support GameShuffle", icon: <IconHeart size={16} stroke={2} aria-hidden="true" />, onClick: go("/settings/support") },
      { label: "Help", onClick: go("/help") },
    ],
  });

  // No section label on the sign-out group — danger styling handles
  // visual separation without needing a redundant header.
  sections.push({
    items: [
      {
        label: "Sign Out",
        danger: true,
        onClick: () => {
          args.setOpen(false);
          void args.signOut();
        },
      },
    ],
  });

  return sections;
}

export function UserMenu() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [hasStreamerIntegration, setHasStreamerIntegration] = useState(false);
  const [lounges, setLounges] = useState<number | null>(null);
  const [reviews, setReviews] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Collapse the menu when the user scrolls down (it rides with the nav, which
  // auto-hides), avoiding an awkward floating overlap. Plays a pop-out first so
  // it tucks away instead of vanishing. State updates run in callbacks.
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    closingRef.current = false;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last + 4 && !closingRef.current) {
        closingRef.current = true;
        setClosing(true);
        window.setTimeout(() => {
          setOpen(false);
          setClosing(false);
        }, 180);
      }
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  const loadProfile = () => {
    if (!user) {
      setProfile(null);
      setHasStreamerIntegration(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from("users")
      .select("avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar, role, display_name, username")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        setProfile((data as ProfileSnapshot | null) ?? null);
      });
    // Probe twitch_connections to decide whether to surface the Stream
    // Hub link. The hub itself gates on Pro tier — but most users with a
    // twitch_connections row are Pro because the streamer integration
    // OAuth requires it. If a user downgrades, they hit /pricing on
    // click rather than seeing a 404; acceptable trade-off vs adding
    // another query here.
    supabase
      .from("twitch_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setHasStreamerIntegration(!!data);
      });
  };

  // Time trial reviews: asked each time the menu opens (the count changes as reviewers work), only for signed-in accounts.
  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    fetch("/api/time-trials/review?counts=1", { cache: "no-store" }).then((r) => r.json()).then((j: { counts?: { total: number } | null }) => { if (alive) setReviews(j.counts ? j.counts.total : null); }).catch(() => undefined);
    return () => { alive = false; };
  }, [open, user]);

  // GS Ranked lounges: asked the first time the menu opens, so no page load pays for it.
  useEffect(() => {
    if (!open || lounges !== null || !user) return;
    let alive = true;
    fetch("/api/ranked/mine").then((r) => r.json()).then((j: { lounges?: unknown[] }) => { if (alive) setLounges(j.lounges?.length ?? 0); }).catch(() => { if (alive) setLounges(0); });
    return () => { alive = false; };
  }, [open, lounges, user]);

  useEffect(() => {
    // loadProfile is async (setState only after the fetch resolves).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile();
  }, [user]);

  useEffect(() => {
    const handler = () => loadProfile();
    window.addEventListener("profile-updated", handler);
    window.addEventListener("gs:connections-changed", handler);
    return () => {
      window.removeEventListener("profile-updated", handler);
      window.removeEventListener("gs:connections-changed", handler);
    };
  }, [user]);

  // Resolve display identity — substitutes a fixture (Pro/Free Demo User)
  // when staff is impersonating, returns kind='unauth' when staff is
  // viewing-as-logged-out. Real ownership/RLS is unaffected.
  const identity = useDisplayIdentity({ user, profile });

  if (loading) return null;

  if (identity.kind === "unauth") {
    return (
      <span className="user-menu__auth">
        <a href="/login" className="user-menu__login">
          <Button variant="ghost" size="small">Log In</Button>
        </a>
        <a href="/signup" className="user-menu__signup">
          <Button variant="primary" size="small">Sign up</Button>
        </a>
      </span>
    );
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu__trigger"
        onClick={() => setOpen(!open)}
      >
        <UserAvatar
          user={identity.avatarUser}
          size={26}
          alt=""
          className="user-menu__avatar"
        />
        {identity.displayName}
      </button>

      {open && (
        <div className={`user-menu__dropdown dark${closing ? " is-closing" : ""}`}>
          <Menu
            sections={buildMenuSections({
              router,
              signOut,
              setOpen,
              hasStreamerIntegration,
              isStaff: isStaffRole(profile?.role ?? null),
              hasLounges: !!lounges,
              reviews,
              username: profile?.username ?? null,
            })}
          />
        </div>
      )}
    </div>
  );
}
