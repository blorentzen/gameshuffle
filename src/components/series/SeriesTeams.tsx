"use client";

/**
 * The Teams tab: a card per team with both players (pick 10A: filled from GameShuffle; hours played is the
 * player's own count), and for a signed-in player, their own card's two settings.
 */

import { useState } from "react";
import Link from "next/link";
import { Avatar, Badge, Button, Card, FormField, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { Select } from "@/components/ui/Select";
import { ORDINAL, ROLE_LABEL } from "@/lib/series/rules";
import type { PlayerCard, SeriesTeamView } from "@/lib/series/view";
import { LivePill, TeamTag } from "./SeriesBits";
import { EVENTS, track } from "@/lib/analytics/events";

function initials(name: string): string {
  return name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

function PlayerFacts({ p }: { p: PlayerCard }) {
  const facts: [string, React.ReactNode][] = [];
  if (p.combo) facts.push(["Combo", `${p.combo.character} · ${p.combo.vehicle} · ${p.combo.wheels} · ${p.combo.glider}`]);
  facts.push(["Best time", p.best ? <>{p.best.track} {p.best.time} <small>({ORDINAL(p.best.place)} of {p.best.total})</small></> : "None yet"]);
  if (p.mmr != null) facts.push(["Lounge", `MMR ${p.mmr.toLocaleString("en-US")}`]);
  if (p.hours != null) facts.push(["Played", <>{p.hours.toLocaleString("en-US")} hours <small>(their count)</small></>]);
  return (
    <dl className="ss-facts">
      {facts.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

function PlayerRow({ p }: { p: PlayerCard }) {
  return (
    <li className="ss-player">
      <div className="ss-player__top">
        <Avatar src={p.avatar ?? undefined} alt="" initials={initials(p.name)} size="medium" />
        <div className="ss-player__name">
          <b>{p.username ? <Link href={`/u/${p.username}`}>{p.name}</Link> : p.name}</b>
          <Badge variant={p.role === "competitive" ? "info" : "warning"} size="small">{ROLE_LABEL[p.role]}</Badge>
        </div>
        {p.live && p.twitch && (
          <a className="ss-player__live" href={`https://twitch.tv/${p.twitch}`} target="_blank" rel="noopener noreferrer">
            <LivePill>Live</LivePill><span className="sr-only"> on Twitch (opens in a new tab)</span>
          </a>
        )}
      </div>
      <PlayerFacts p={p} />
      {(p.links.length > 0 || p.username) && (
        <ul className="ss-links" aria-label={`${p.name}'s links`}>
          {p.links.map((l) => (
            <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label}<span className="sr-only"> (opens in a new tab)</span></a></li>
          ))}
          {p.username && <li><Link href={`/u/${p.username}`}>Profile</Link></li>}
        </ul>
      )}
    </li>
  );
}

export function TeamCards({ teams }: { teams: SeriesTeamView[] }) {
  return (
    <div className="ss-teams">
      {teams.map((t) => (
        <Card key={t.id} variant="outlined" padding="none" className="ss-team" style={{ ["--tc" as string]: t.color }}>
          <div className="ss-team__head">
            <TeamTag team={t} />
            <h3>{t.name}</h3>
            {t.look && <span className="ss-team__look">{t.look}</span>}
          </div>
          {t.players.length ? (
            <ul className="ss-team__players">{t.players.map((p) => <PlayerRow key={p.id} p={p} />)}</ul>
          ) : (
            <p className="ss-muted ss-team__empty">Players to come.</p>
          )}
        </Card>
      ))}
    </div>
  );
}

/** A player's own card: their hours (their count) and which saved kart build shows. */
export function MyCardEditor({ slug, player, builds, onSaved }: {
  slug: string;
  player: { hours: number | null; kartConfigId: string | null };
  builds: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [hours, setHours] = useState(player.hours == null ? "" : String(player.hours));
  const [build, setBuild] = useState(player.kartConfigId ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/series/${slug}/card`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours: hours === "" ? null : Number(hours), kartConfigId: build || null }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { error?: string } | null;
    setSaving(false);
    if (!res?.ok) { toast.error(j?.error ?? "Couldn't save that."); return; }
    toast.success("Saved");
    track(EVENTS.seriesCardSaved);
    onSaved();
  };
  return (
    <section className="ss-mycard" aria-labelledby="ss-mycard-h">
      <h3 id="ss-mycard-h">Your card</h3>
      <p className="ss-muted">Your combo comes from a saved kart build, your best time from time trials and your MMR from the lounge.</p>
      <div className="ss-mycard__fields">
        <FormField label="Hours played (your own count)" htmlFor="ss-hours">
          <Input id="ss-hours" type="number" inputMode="numeric" min={0} value={hours} onChange={(e) => setHours(e.target.value)} />
        </FormField>
        <FormField label="Kart build to show" htmlFor="ss-build">
          <Select
            id="ss-build"
            value={build}
            onChange={(v) => setBuild(Array.isArray(v) ? v[0] ?? "" : v)}
            options={[{ value: "", label: builds.length ? "My newest build" : "No saved builds yet" }, ...builds.map((b) => ({ value: b.id, label: b.name }))]}
          />
        </FormField>
        <Button variant="secondary" onClick={save} disabled={saving}>{saving ? "Saving" : "Save my card"}</Button>
      </div>
      <p className="ss-muted ss-small">
        <Link href="/randomizers/mario-kart-8-deluxe">Save a kart build</Link> · <Link href="/time-trials/mario-kart-8-deluxe">Add a time trial</Link> · <Link href="/lounge">Confirm your lounge name</Link>
      </p>
    </section>
  );
}
