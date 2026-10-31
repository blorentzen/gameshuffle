"use client";

/** Find a player with times by name; each opens their time trials page (accounts and Discord players alike). */

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, Search } from "@empac/cascadeds";
import { IconBrandDiscord } from "@tabler/icons-react";
import { playerPagePath } from "@/lib/timeTrials/playerPath";

type Found = { player: string; name: string; avatar: string | null; profile: string | null; discord: boolean };

export function TtPlayerSearch() {
  const id = useId();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // CDS Search takes no id or label, so the visible label is tied to its input here.
  useEffect(() => { const input = wrap.current?.querySelector("input"); if (input) input.id = id; }, [id]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const text = q.trim();
    if (text.length < 2) return;
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const j = (await fetch(`/api/time-trials?q=${encodeURIComponent(text)}`).then((r) => r.json()).catch(() => ({}))) as { players?: Found[] };
        setFound(j.players ?? []);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const shown = q.trim().length >= 2 ? found : null;
  return (
    <div className="tt-search">
      <label htmlFor={id} className="tt-search__label">Find a player</label>
      <div className="tt-search__box" ref={wrap}>
        <Search value={q} onChange={setQ} onClear={() => setQ("")} placeholder="A name on GameShuffle or Discord" loading={loading} />
      </div>
      <p className="sr-only" role="status">{shown ? `${shown.length} ${shown.length === 1 ? "player" : "players"} found` : ""}</p>
      {shown && (
        shown.length ? (
          <ul className="tt-search__results">
            {shown.map((p) => (
              <li key={p.player}>
                <Avatar size="small" src={p.avatar ?? undefined} initials={p.name.slice(0, 1).toUpperCase()} alt="" />
                <Link href={playerPagePath(p.player, p.profile)}>{p.name}</Link>
                {p.discord && <span className="tt-search__note"><IconBrandDiscord size={16} aria-hidden="true" /> Plays from Discord</span>}
              </li>
            ))}
          </ul>
        ) : <p className="tt-search__none">No one by that name has a time yet.</p>
      )}
    </div>
  );
}
