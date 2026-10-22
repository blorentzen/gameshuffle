"use client";

/**
 * A server's Mario Kart lounge settings (GS Pro, competitive dashboard picks 2026-10-20):
 * `part="roles"` = division roles for members who confirmed their lounge name, kept in step
 * every 15 minutes; `part="board"` = a Monday board of those members. Saves on change.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast/ToastProvider";
import { Select } from "@/components/ui/Select";
import { MMR_GAMES, MMR_GAME_IDS } from "@/lib/mmr/rules";

const OPTIONS = [{ value: "", label: "Off" }, ...MMR_GAME_IDS.map((g) => ({ value: g, label: MMR_GAMES[g].short }))];

export function DiscordLoungeCard({ part, withGuild }: { part: "roles" | "board"; withGuild: (url: string) => string }) {
  const toast = useToast();
  const [state, setState] = useState<{ ready: boolean; rolesGame: string | null; boardGame: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(withGuild("/api/discord/bot/lounge")).then((r) => r.json()).then((j) => { if (live && j.ok) setState({ ready: !!j.ready, rolesGame: j.rolesGame, boardGame: j.boardGame }); }).catch(() => {});
    return () => { live = false; };
  }, [withGuild]);
  if (!state) return null;
  const value = (part === "roles" ? state.rolesGame : state.boardGame) ?? "";
  const save = async (next: string) => {
    const before = state;
    setState({ ...state, [part === "roles" ? "rolesGame" : "boardGame"]: next || null });
    const res = await fetch(withGuild("/api/discord/bot/lounge"), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(part === "roles" ? { roles_game: next || null } : { board_game: next || null }) }).catch(() => null);
    if (res?.ok) toast.success("Saved");
    else { setState(before); toast.error("Couldn't save that. Try again in a moment."); }
  };
  return (
    <div className="account-card">
      <h2 className="account-card__title">{part === "roles" ? "Lounge division roles" : "Weekly lounge board"}</h2>
      <p className="dbot-muted">
        {part === "roles"
          ? <>Members who confirmed their Mario Kart lounge name on <Link href="/lounge">GameShuffle</Link> get a role for their division, kept in step every 15 minutes. The bot makes the roles (Iron to Grandmaster) the first time, so it needs the Manage Roles permission, with its own role above them.</>
          : <>Every Monday, a board of this server&apos;s members who confirmed their Mario Kart lounge name on <Link href="/lounge">GameShuffle</Link>, posted where you route Mario Kart lounge (else your default channel).</>}
      </p>
      {state.ready ? (
        <div style={{ maxWidth: "28rem" }}>
          <Select floatingLabel={part === "roles" ? "Roles follow" : "Board covers"} aria-label={part === "roles" ? "Roles follow" : "Board covers"} value={value} onChange={(v) => void save(String(v))} options={OPTIONS} />
        </div>
      ) : (
        <p className="dbot-muted">This needs a database update before it can be turned on.</p>
      )}
    </div>
  );
}
