"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@empac/cascadeds";
import { useAuth } from "./AuthProvider";
import { createClient } from "@/lib/supabase/client";

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
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

  const loadAvatar = () => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("users")
      .select("avatar_source, discord_avatar, twitch_avatar")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (!data) { setAvatarUrl(null); return; }
        if (data.avatar_source === "discord" && data.discord_avatar) setAvatarUrl(data.discord_avatar);
        else if (data.avatar_source === "twitch" && data.twitch_avatar) setAvatarUrl(data.twitch_avatar);
        else setAvatarUrl(null);
      });
  };

  useEffect(() => {
    loadAvatar();
  }, [user]);

  useEffect(() => {
    const handler = () => loadAvatar();
    window.addEventListener("profile-updated", handler);
    return () => window.removeEventListener("profile-updated", handler);
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
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu__trigger"
        onClick={() => setOpen(!open)}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="user-menu__avatar" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <span className="user-menu__avatar">{initials}</span>
        )}
        {displayName}
      </button>

      {open && (
        <div className="user-menu__dropdown">
          <a href="/account?tab=profile" className="user-menu__item">Profile</a>
          <a href="/account?tab=app" className="user-menu__item">My Stuff</a>
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
