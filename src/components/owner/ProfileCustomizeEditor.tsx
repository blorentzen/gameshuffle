"use client";

/**
 * Appearance editor for your own /u page, opened from the OwnerBar.
 *
 * It hosts the same ProfileSkinEditor that lives on the Brand & Theme tab
 * rather than a copy of its controls, so there is one editor with one save
 * path and no chance of the two drifting. What this adds is the thing the
 * account tab cannot give you: the change lands on the actual profile behind
 * the drawer, at the moment you make it.
 *
 * Everything that is NOT appearance — tagline, featured game, pinned post,
 * gamertags — stays on /account, reached through the bar's Manage. That is the
 * split the bar exists to express: looks here, everything else there.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, Drawer } from "@empac/cascadeds";
import { ProfileSkinEditor } from "@/components/account/ProfileSkinEditor";
import { previewSkin } from "@/lib/profile/skinPreview";
import type { ProfileSkin } from "@/lib/profile/skin";

export function ProfileCustomizeEditor() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The skin editor autosaves, so by the time the drawer closes the server
  // already has every change. Closing therefore refreshes rather than
  // restoring: there is no unsaved state to throw away.
  const dirtyRef = useRef(false);
  // The editor reports the saved skin once when it finishes loading. That
  // first call paints nothing new, so it must not count as a change, or every
  // open-then-close would refresh the page for no reason.
  const seenRef = useRef(false);

  const preview = useCallback((skin: ProfileSkin) => {
    const el = document.querySelector<HTMLElement>("main.profile-page");
    if (!el) return;
    if (seenRef.current) dirtyRef.current = true;
    seenRef.current = true;
    previewSkin(el, skin, {
      brandPrimary: getComputedStyle(el).getPropertyValue("--brand-primary").trim() || null,
    });
  }, []);

  useEffect(() => {
    if (open) return;
    // Pull the server's version back once the drawer closes, so the page stops
    // showing a preview and starts showing what is actually stored.
    if (dirtyRef.current) { dirtyRef.current = false; router.refresh(); }
  }, [open, router]);

  return (
    <>
      <Button variant="secondary" size="small" onClick={() => setOpen(true)}>Customize</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        position="right"
        size="standard"
        title="Customize your profile"
        subtitle="Changes show on the page as you make them, and save on their own."
        /* No overlay: the page behind IS the preview. */
        showOverlay={false}
      >
        <ProfileSkinEditor bare onChange={preview} />
      </Drawer>
    </>
  );
}
