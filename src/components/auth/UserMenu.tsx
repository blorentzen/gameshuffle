"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Menu, type MenuSectionProps } from "@empac/cascadeds";
import { useAuth } from "./AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { useDisplayIdentity } from "@/lib/capabilities/useDisplayIdentity";

interface ProfileSnapshot {
  avatar_source: AvatarSource | string | null;
  avatar_seed: string | null;
  avatar_options: Record<string, string> | null;
  discord_avatar: string | null;
  twitch_avatar: string | null;
}

/**
 * Build the categorized menu sections per CDS Menu — Activity / Settings /
 * Help / (signout). The Activity section only renders when the user has
 * a Twitch streamer integration, so non-streamers see a focused
 * account-only menu.
 */
function buildMenuSections(args: {
  router: ReturnType<typeof useRouter>;
  signOut: () => void | Promise<void>;
  setOpen: (open: boolean) => void;
  hasStreamerIntegration: boolean;
}): MenuSectionProps[] {
  const go = (path: string) => () => {
    args.setOpen(false);
    args.router.push(path);
  };
  const sections: MenuSectionProps[] = [];

  if (args.hasStreamerIntegration) {
    sections.push({
      label: "Activity",
      items: [{ label: "Stream Hub", onClick: go("/hub") }],
    });
  }

  sections.push({
    label: "Settings",
    items: [
      { label: "Profile", onClick: go("/account?tab=profile") },
      { label: "My Stuff", onClick: go("/account?tab=app") },
      { label: "Integrations", onClick: go("/account?tab=integrations") },
      { label: "Plans", onClick: go("/account?tab=plans") },
      { label: "Security", onClick: go("/account?tab=security") },
    ],
  });

  sections.push({
    label: "Help",
    items: [{ label: "Help & Support", onClick: go("/help") }],
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

  const loadProfile = () => {
    if (!user) {
      setProfile(null);
      setHasStreamerIntegration(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from("users")
      .select("avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar")
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

  useEffect(() => {
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
      <a href="/login" className="user-menu__login">
        <Button variant="ghost" size="small">Log In</Button>
      </a>
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
        <div className="user-menu__dropdown">
          <Menu sections={buildMenuSections({ router, signOut, setOpen, hasStreamerIntegration })} />
        </div>
      )}
    </div>
  );
}
