"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@empac/cascadeds";
import { useAuth } from "./AuthProvider";

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
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
        <span className="user-menu__avatar">{initials}</span>
        {displayName}
      </button>

      {open && (
        <div className="user-menu__dropdown">
          <a href="/account" className="user-menu__item">
            Account
          </a>
          <a href="/account/configs" className="user-menu__item">
            Saved Configs
          </a>
          <button
            className="user-menu__item user-menu__item--danger"
            onClick={signOut}
          >
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
