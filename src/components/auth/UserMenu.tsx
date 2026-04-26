"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@empac/cascadeds";
import { useAuth } from "./AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";

interface ProfileSnapshot {
  avatar_source: AvatarSource | string | null;
  avatar_seed: string | null;
  avatar_options: Record<string, string> | null;
  discord_avatar: string | null;
  twitch_avatar: string | null;
}

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
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

  if (loading) return null;

  if (!user) {
    return (
      <a href="/login" className="user-menu__login">
        <Button variant="ghost" size="small">Log In</Button>
      </a>
    );
  }

  const displayName =
    user.user_metadata?.display_name || user.email?.split("@")[0] || "User";

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu__trigger"
        onClick={() => setOpen(!open)}
      >
        <UserAvatar
          user={{
            id: user.id,
            avatar_source: profile?.avatar_source ?? "dicebear",
            avatar_seed: profile?.avatar_seed ?? null,
            avatar_options: profile?.avatar_options ?? null,
            twitch_avatar: profile?.twitch_avatar ?? null,
            discord_avatar: profile?.discord_avatar ?? null,
          }}
          size={26}
          alt=""
          className="user-menu__avatar"
        />
        {displayName}
      </button>

      {open && (
        <div className="user-menu__dropdown">
          <a href="/account?tab=profile" className="user-menu__item">Profile</a>
          <a href="/account?tab=app" className="user-menu__item">My Stuff</a>
          <a href="/account?tab=integrations" className="user-menu__item">Integrations</a>
          <a href="/account?tab=plans" className="user-menu__item">Plans</a>
          <a href="/account?tab=security" className="user-menu__item">Security</a>
          <button className="user-menu__item user-menu__item--danger" onClick={signOut}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
