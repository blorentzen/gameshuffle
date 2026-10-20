"use client";

/**
 * The door to the welcome page from where newcomers actually land (Britton's picks, 2026-10-19):
 * one flat line under the tool on randomizer, daily and deck guide pages, shown once per browser
 * and never to someone signed in. It counts as seen once it has actually been on screen (or is
 * closed or followed), so a visitor who never scrolls that far still gets it next time.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconSparkles, IconX } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import "@/styles/welcome.css";

const KEY = "gs-welcome-line";
const remember = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* no storage */ } };

export function NewHereLine({ from }: { from: string }) {
  const { user, loading } = useAuth();
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (loading || user) return;
    let seen = true;
    try { seen = !!localStorage.getItem(KEY); } catch { /* no storage: stay quiet */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- decided once, after the session loads
    if (!seen) setShow(true);
  }, [loading, user]);
  useEffect(() => {
    const el = ref.current;
    if (!show || !el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { remember(); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  if (!show) return null;
  return (
    <aside className="welcome-line" aria-label="New to GameShuffle" ref={ref}>
      <IconSparkles size={18} stroke={2} aria-hidden="true" />
      <span>New to GameShuffle? <Link href={`/welcome?src=new-here-${from}`} onClick={() => { remember(); track(EVENTS.welcomeLineClicked, { from }); }}>See what else it does in a minute</Link></span>
      <button type="button" className="welcome-line__close" aria-label="Hide this" onClick={() => { remember(); setShow(false); }}><IconX size={16} stroke={2} aria-hidden="true" /></button>
    </aside>
  );
}
