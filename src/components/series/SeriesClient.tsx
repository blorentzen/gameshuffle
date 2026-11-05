"use client";

/**
 * A team series' public page (Summer Series pick 2A): standings first while a night runs, then the teams,
 * the track draft, predictions, the best play vote, rules and FAQ, in CascadeDS Tabs with the tab in the
 * address (?tab=). Polls the series every few seconds while a night or a draft is on, every 30 otherwise,
 * and not while the tab is hidden.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button, Chip, Tabs } from "@empac/cascadeds";
import { IconTrophy } from "@tabler/icons-react";
import { FaqList } from "@/components/marketing/FaqList";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { useToast } from "@/components/toast/ToastProvider";
import { currentNight, seriesPath, type NightView, type SeriesView } from "@/lib/series/view";
import { LivePill, StandingsTable, TeamTag, When } from "./SeriesBits";
import { MyCardEditor, TeamCards } from "./SeriesTeams";
import { DraftBoard } from "./SeriesDraftBoard";
import { SeriesPredict, type MyPicks } from "./SeriesPredict";
import { EVENTS, track } from "@/lib/analytics/events";

interface Me {
  signedIn: boolean;
  staff: boolean;
  player: { id: string; teamId: string; role: string; hours: number | null; kartConfigId: string | null } | null;
  picks: MyPicks;
  balance: number | null;
  vote: string | null;
  builds: { id: string; name: string }[];
}

const NO_ME: Me = { signedIn: false, staff: false, player: null, picks: {}, balance: null, vote: null, builds: [] };

function nightLine(n: NightView): React.ReactNode {
  if (n.state === "live") return <LivePill>Live · race {Math.min(n.racesTotal, n.racesDone + (n.racesDone < n.racesTotal ? 1 : 0))} of {n.racesTotal}</LivePill>;
  if (n.state === "done") return <span className="ss-state">Final results</span>;
  return n.startsAt ? <span className="ss-state"><When iso={n.startsAt} /></span> : <span className="ss-state">Date to come</span>;
}

function NightPicker({ label, nights, active, onPick }: { label: string; nights: NightView[]; active: string | null; onPick: (id: string) => void }) {
  return (
    <div className="ss-nightpick" role="group" aria-label={label}>
      {nights.map((n) => <Chip key={n.id} label={n.label} clickable selected={n.id === active} onClick={() => onPick(n.id)} />)}
    </div>
  );
}

export function SeriesClient({ initial, initialTab }: { initial: SeriesView; initialTab: string }) {
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [me, setMe] = useState<Me>(NO_ME);
  const [skew, setSkew] = useState(0);
  const slug = view.slug;
  const path = seriesPath(slug);
  const night = currentNight(view);
  const busy = view.nights.some((n) => n.state === "live" || n.draft?.status === "running" || n.draft?.status === "paused");
  const fetching = useRef(false);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const sent = Date.now();
    const res = await fetch(`/api/series/${slug}`, { cache: "no-store" }).catch(() => null);
    fetching.current = false;
    if (!res?.ok) return;
    const v = (await res.json().catch(() => null)) as SeriesView | null;
    if (!v) return;
    setView(v);
    setSkew(v.now - Math.round((sent + Date.now()) / 2));
  }, [slug]);

  const refreshMe = useCallback(async () => {
    const res = await fetch(`/api/series/${slug}/me`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as Me | null;
    if (res?.ok && j) setMe(j);
  }, [slug]);

  useEffect(() => { void refreshMe(); }, [refreshMe]);
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const id = window.setInterval(tick, busy ? 3000 : 30000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [busy, refresh]);

  const changed = useCallback(() => { void refresh(); void refreshMe(); }, [refresh, refreshMe]);
  const loginHref = `/login?redirect=${encodeURIComponent(path)}`;
  const team = (id: string | null | undefined) => view.teams.find((t) => t.id === id) ?? null;
  const champion = team(view.awards.champion);

  // ── Standings ──
  const doneOthers = view.nights.filter((n) => n.id !== night?.id && n.racesDone > 0);
  const standings = (
    <div className="ss-panel">
      {champion && (
        <div className="ss-champ" style={{ ["--tc" as string]: champion.color }}>
          <IconTrophy size={32} aria-hidden />
          <div>
            <span className="ss-kicker">Champions</span>
            <p className="ss-champ__name"><TeamTag team={champion} /> {champion.name}</p>
            <p className="ss-muted">{champion.players.map((p) => p.name).join(" and ")}</p>
          </div>
        </div>
      )}
      {night && (
        <section aria-labelledby="ss-now">
          <div className="ss-section-head">
            <h2 id="ss-now">{night.label}</h2>
            {nightLine(night)}
          </div>
          {night.racesDone > 0 ? (
            <StandingsTable rows={night.teams} teams={view.teams} label={`${night.label} standings`} showLast={night.state === "live"} />
          ) : (
            <p className="ss-muted">Standings show once the first race is in. {night.hostTeamId && team(night.hostTeamId) ? `${team(night.hostTeamId)!.name} host the room.` : ""}</p>
          )}
          {!night.counts && view.nights.some((n) => n.counts) && <p className="ss-muted ss-small">The {night.label} sets the order for the next night. It doesn&rsquo;t count toward the champions.</p>}
        </section>
      )}
      {view.total && (
        <section aria-labelledby="ss-total">
          <h2 id="ss-total">Series total</h2>
          <StandingsTable rows={view.total} teams={view.teams} label="Series total" showLast={false} />
        </section>
      )}
      {doneOthers.map((n) => (
        <section key={n.id} aria-labelledby={`ss-n-${n.id}`}>
          <div className="ss-section-head"><h2 id={`ss-n-${n.id}`}>{n.label}</h2>{nightLine(n)}</div>
          <StandingsTable rows={n.teams} teams={view.teams} label={`${n.label} standings`} showLast={false} />
        </section>
      ))}
      {(view.awards.bestCreator || view.awards.mostImproved || view.awards.bestPlay) && (
        <section aria-labelledby="ss-awards">
          <h2 id="ss-awards">Awards</h2>
          <ul className="ss-awards">
            {view.awards.bestCreator && (() => {
              const p = view.teams.flatMap((t) => t.players).find((x) => x.id === view.awards.bestCreator!.playerId);
              return p ? <li><b>Best creator</b><span>{p.name}, {view.awards.bestCreator!.points} points</span></li> : null;
            })()}
            {view.awards.mostImproved && <li><b>Most improved</b><span>{team(view.awards.mostImproved.teamId)?.name}, up {view.awards.mostImproved.climbed} {view.awards.mostImproved.climbed === 1 ? "place" : "places"}</span></li>}
            {view.awards.bestPlay && <li><b>Best play</b><span>{view.plays.find((p) => p.id === view.awards.bestPlay!.playId)?.title}, {view.awards.bestPlay.votes} votes</span></li>}
          </ul>
        </section>
      )}
      <section aria-labelledby="ss-schedule">
        <h2 id="ss-schedule">Schedule</h2>
        <ul className="ss-schedule">
          {view.nights.map((n) => (
            <li key={n.id}>
              <b>{n.label}</b>
              <span>{n.startsAt ? <When iso={n.startsAt} /> : "Date to come"}</span>
              <span className="ss-muted">{n.state === "done" ? "Done" : n.state === "live" ? "On now" : n.counts ? "Counts toward the champions" : "Sets the order"}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  // ── Teams ──
  const teamsPanel = (
    <div className="ss-panel">
      <h2 className="sr-only">Teams</h2>
      {me.player && <MyCardEditor slug={slug} player={me.player} builds={me.builds} onSaved={changed} />}
      <TeamCards teams={view.teams} />
    </div>
  );

  // ── Tracks ──
  const drafted = view.nights.filter((n) => n.draft);
  const [draftNight, setDraftNight] = useState<string | null>(null);
  const shownDraft = drafted.find((n) => n.id === draftNight) ?? drafted.find((n) => n.draft?.status === "running" || n.draft?.status === "paused") ?? drafted.find((n) => n.id === night?.id) ?? drafted[drafted.length - 1] ?? null;
  const tracksPanel = (
    <div className="ss-panel">
      <h2 className="sr-only">Track draft</h2>
      {drafted.length > 1 && (
        <NightPicker label="Which night's draft" nights={drafted} active={shownDraft?.id ?? null} onPick={setDraftNight} />
      )}
      {shownDraft ? (
        <DraftBoard key={shownDraft.id} slug={slug} night={shownDraft} teams={view.teams} myTeamId={me.player?.teamId ?? null} staff={me.staff} skew={skew} onChanged={changed} />
      ) : (
        <p className="ss-muted">Before each night, the teams take turns banning a track and protecting one until half the tracks are left. Races are only on what&rsquo;s left.</p>
      )}
    </div>
  );

  // ── Predict ──
  const predNights = view.nights.filter((n) => view.predictions.some((p) => p.nightId === n.id));
  const [predNight, setPredNight] = useState<string | null>(null);
  const shownPred = predNights.find((n) => n.id === predNight) ?? predNights.find((n) => n.id === night?.id) ?? predNights[predNights.length - 1] ?? null;
  const predictPanel = shownPred ? (
    <div className="ss-panel">
      <h2 className="sr-only">Predictions</h2>
      {predNights.length > 1 && (
        <NightPicker label="Which night's predictions" nights={predNights} active={shownPred.id} onPick={setPredNight} />
      )}
      <SeriesPredict slug={slug} night={shownPred} teams={view.teams} predictions={view.predictions} picks={me.picks} balance={me.balance} signedIn={me.signedIn} loginHref={loginHref} onChanged={changed} />
    </div>
  ) : null;

  // ── Best play ──
  const vote = async (playId: string) => {
    const res = await fetch(`/api/series/${slug}/vote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playId }) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { error?: string } | null;
    if (!res?.ok) { toast.error(j?.error ?? "Couldn't save your vote."); return; }
    toast.success("Vote saved");
    track(EVENTS.seriesVoted);
    changed();
  };
  const playsPanel = view.plays.length ? (
    <div className="ss-panel">
      <h2 className="sr-only">Best play</h2>
      <p className="ss-muted">One vote per account. Voting again moves your vote.</p>
      <ul className="ss-plays">
        {view.plays.map((p) => {
          const who = view.teams.flatMap((t) => t.players).find((x) => x.id === p.playerId);
          const mine = me.vote === p.id;
          return (
            <li key={p.id} className="ss-play">
              <div>
                <ArrowLink href={p.url} external>{p.title}</ArrowLink>
                <span className="ss-muted ss-small">{who ? `${who.name} · ` : ""}{p.votes} {p.votes === 1 ? "vote" : "votes"}</span>
              </div>
              {me.signedIn ? (
                <Button variant={mine ? "primary" : "secondary"} size="small" aria-pressed={mine} onClick={() => vote(p.id)} disabled={mine}>{mine ? "Your vote" : "Vote"}</Button>
              ) : (
                <Link className="ss-small" href={loginHref}>Sign in to vote</Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  ) : null;

  const rulesPanel = view.rules.trim() ? (
    <div className="ss-panel ss-prose">
      {view.rules.split(/\n\s*\n/).map((para, i) => <p key={i}>{para.trim()}</p>)}
    </div>
  ) : null;

  const faqPanel = view.faq.length ? (
    <div className="ss-panel">
      <FaqList items={view.faq.map((f) => ({ q: f.q, a: <p>{f.a}</p> }))} />
      <p className="ss-small ss-help">
        {view.discordUrl ? <><a href={view.discordUrl} target="_blank" rel="noopener noreferrer">Ask in the Discord<span className="sr-only"> (opens in a new tab)</span></a> · </> : null}
        <Link href={`/contact-us?topic=series&about=${encodeURIComponent(view.title)}&page=${encodeURIComponent(path)}`}>Contact us</Link>
        {" · "}<Link href="/help/tournaments/team-series">How a team series works</Link>
      </p>
    </div>
  ) : null;

  const tabs = useMemo(() => [
    { id: "standings", label: "Standings", content: standings },
    { id: "teams", label: "Teams", content: teamsPanel },
    { id: "tracks", label: "Tracks", content: tracksPanel },
    ...(predictPanel ? [{ id: "predict", label: "Predict", content: predictPanel }] : []),
    ...(playsPanel ? [{ id: "plays", label: "Best play", content: playsPanel }] : []),
    ...(rulesPanel ? [{ id: "rules", label: "Rules", content: rulesPanel }] : []),
    ...(faqPanel ? [{ id: "faq", label: "FAQ", content: faqPanel }] : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [view, me, skew, draftNight, predNight]);

  const [active, setActive] = useState(tabs.some((t) => t.id === initialTab) ? initialTab : "standings");
  const select = (id: string) => {
    setActive(id);
    const sp = new URLSearchParams(window.location.search);
    if (id === "standings") sp.delete("tab"); else sp.set("tab", id);
    const q = sp.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  };

  return (
    <div className="ss-body">
      {me.staff && (
        <p className="ss-staffbar"><ArrowLink href={`/series/${slug}/manage`}>Run this series</ArrowLink>{view.status === "draft" && <span className="ss-muted"> · Only staff can see this page until it&rsquo;s announced.</span>}</p>
      )}
      <div className="ss-tabs">
        <Tabs tabs={tabs} variant="underline" activeTab={tabs.some((t) => t.id === active) ? active : "standings"} onChange={select} />
      </div>
    </div>
  );
}
