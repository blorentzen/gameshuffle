"use client";

/**
 * The MMR card studio (/mmr-card, signed in). Find your lounge name, pick a look with a
 * live preview (and moments to try), copy the OBS link. Everything saves itself. GS Pro
 * choices can be tried in the preview; a free card saves their free versions and says so.
 * GS Pro also keeps up to ten looks and can switch them with the Twitch game on stream.
 * Lounge night picks (2026-10-20): tonight's goal and the Monday report (GS Pro), and
 * "Share the night" for a confirmed lounge player (free).
 * The choices sit in three tabs beside the preview: Look, What's on the card and Moments
 * ("What's on the card" picks, 2026-10-21; MmrInfoControls.tsx).
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button, Chip, ColorPicker, Input, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconCopy, IconPlayerPlay, IconPlus, IconRefresh, IconSearch, IconTargetArrow, IconTrash } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { EVENTS, track } from "@/lib/analytics/events";
import { PROFILE_ACCENTS } from "@/lib/profile/accents";
import {
  DEFAULT_LOOK, LOOK_CHOICES, MAX_LOOKS, fontStylesheet, proUsed, type MmrLook,
} from "@/lib/mmr/look";
import { MMR_GAMES, MMR_GAME_IDS, demoSource, fmtMmr, viewOf, type MmrGame, type MmrSource } from "@/lib/mmr/rules";
import { cleanGoal, goalProgress, goalText, GOAL_MAX } from "@/lib/mmr/goal";
import { nightFor } from "@/lib/lounge/night";
import type { MmrCardView } from "@/lib/mmr/types";
import { MmrCard } from "./MmrCard";
import { LoungeShareNight } from "./LoungeShareNight";
import { useMmrPreview, type PreviewMoment } from "./MmrLive";
import { MmrMoments, MmrRollingControls, MmrWhatsOn } from "./MmrInfoControls";

const noop = () => () => {};
/** The OBS source's width per layout (Rolling per shape), and its height before the preview has been measured. */
const OBS_SIZE: Record<Exclude<MmrLook["layout"], "rolling"> | `rolling-${MmrLook["rolling"]["shape"]}`, [number, number]> = {
  deck: [700, 450],
  panel: [700, 430],
  strip: [760, 170],
  sticker: [320, 360],
  "rolling-bar": [700, 160],
  "rolling-box": [380, 390],
  "rolling-tall": [320, 560],
};
/** "700 wide, 450 tall": the card's measured shape at the source's width (16px page padding each side, a little room). */
const obsSize = (look: Pick<MmrLook, "layout" | "rolling">, ratio: number | null) => {
  const key: keyof typeof OBS_SIZE = look.layout === "rolling" ? `rolling-${look.rolling.shape}` : look.layout;
  const [w, h] = OBS_SIZE[key];
  const tall = ratio ? Math.ceil(((w - 32) * ratio + 40) / 10) * 10 : h;
  return `${w} wide, ${tall} tall`;
};

type Found = { source: MmrSource; playerId: number; events: number } | null;
type Lookup = "idle" | "looking" | "not_found" | "unavailable" | "found";

/** A lounge player this account has confirmed by Discord (lounge_links). */
export interface StudioLink { game: MmrGame; playerId: number; name: string }

export function MmrStudio({ initial, pro, avatar, links = [] }: { initial: MmrCardView | null; pro: boolean; avatar: string | null; links?: StudioLink[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "https://www.gameshuffle.co");

  const [card, setCard] = useState<MmrCardView | null>(initial);
  const [looks, setLooks] = useState<MmrLook[]>(initial?.looks?.length ? initial.looks : [DEFAULT_LOOK]);
  const [activeId, setActiveId] = useState<string>(initial?.activeLook ?? (initial?.looks?.[0]?.id ?? DEFAULT_LOOK.id));
  const [followTwitch, setFollowTwitch] = useState(initial?.followTwitch ?? false);
  const [showOnProfile, setShowOnProfile] = useState(initial?.showOnProfile ?? true);
  const [name, setName] = useState(initial?.loungeName ?? "");
  const [found, setFound] = useState<Found>(null);
  const [lookup, setLookup] = useState<Lookup>("idle");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Tonight's goal and the weekly report (GS Pro); saved straight away, apart from the looks' autosave.
  const [goal, setGoal] = useState<MmrCardView["goal"]>(initial?.goal ?? null);
  const [goalInput, setGoalInput] = useState(initial?.goal ? String(initial.goal.mmr) : "");
  const [weekly, setWeekly] = useState(initial?.weeklyReport ?? true);
  const [savingGoal, setSavingGoal] = useState(false);
  const [tab, setTab] = useState("look");
  const [lineWarn, setLineWarn] = useState(false);
  // The preview's shape, for the OBS size (pieces and recent events change a card's height).
  const previewRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  const look = looks.find((l) => l.id === activeId) ?? looks[0];
  const setLook = (patch: Partial<MmrLook>) => setLooks((ls) => ls.map((l) => (l.id === look.id ? { ...l, ...patch } : l)));

  // Saves the looks and switches (the name saves when it's found).
  const payload = useMemo(() => ({ looks, activeLook: activeId, followTwitch, showOnProfile }), [looks, activeId, followTwitch, showOnProfile]);
  const lastFreeNote = useRef("");
  const { status } = useAutosave(payload, async (v) => {
    const res = await fetch("/api/mmr/card", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
    if (!res.ok) return false;
    const data = (await res.json()) as { card: MmrCardView; freeSaved: string[]; lineRefused?: boolean };
    setCard(data.card);
    setLineWarn(!!data.lineRefused);
    const note = data.freeSaved.join(", ");
    if (note && note !== lastFreeNote.current) toast.info(`Saved with free looks. ${note} ${data.freeSaved.length === 1 ? "needs" : "need"} GS Pro.`);
    lastFreeNote.current = note;
    return true;
  });

  // Finds the player in the look's game and pins the name.
  const findMe = async (game: MmrGame = look.game, quiet = false) => {
    const n = name.trim();
    if (!n) { setLookup("idle"); setFound(null); return; }
    setLookup("looking");
    try {
      const res = await fetch(`/api/mmr/lookup?name=${encodeURIComponent(n)}&game=${game}`);
      const data = await res.json();
      if (!data.ok) { setLookup(data.reason === "not_found" ? "not_found" : "unavailable"); setFound(null); return; }
      setFound({ source: { ...data.source, avatar }, playerId: data.playerId, events: data.eventsPlayed });
      setLookup("found");
      if ((card?.loungeName ?? "") !== n) {
        const save = await fetch("/api/mmr/card", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ loungeName: n }) });
        if (save.ok) {
          setCard(((await save.json()) as { card: MmrCardView }).card);
          track(EVENTS.mmrCardSaved, { game });
          if (!quiet) toast.success("Found you. Your card follows this lounge name now.");
        }
      }
    } catch {
      setLookup("unavailable");
    }
  };

  // Look the saved name up again when the look's game changes (and on first load).
  const gameRef = useRef<MmrGame | null>(null);
  useEffect(() => {
    if (gameRef.current === look.game) return;
    gameRef.current = look.game;
    if ((card?.loungeName ?? name).trim()) void findMe(look.game, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look.game]);

  const demo = useMemo(() => ({ ...demoSource(look.game, name.trim() || "Sam"), avatar }), [look.game, name, avatar]);
  const activeGoal = pro && goal?.active && goal.game === look.game ? goal.mmr : null;
  const preview = useMmrPreview(found?.source ?? demo, activeGoal);
  const usedPro = proUsed(look);
  const font = fontStylesheet(look.font);

  const pickValue = (id: keyof MmrLook, v: string | boolean) => setLook({ [id]: v } as Partial<MmrLook>);

  useEffect(() => {
    const el = previewRef.current?.querySelector<HTMLElement>(".mmr");
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (el.offsetWidth) setRatio(el.offsetHeight / el.offsetWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [look.layout, look.rolling.shape]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/mmr/picture", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error === "too_big" ? "That picture is over 4 MB." : data.error === "bad_type" ? "Use a PNG, JPG, WebP or GIF." : data.error === "pro_required" ? "Your own picture is part of GS Pro." : "Couldn't upload that picture. Try again?");
        return;
      }
      setLook({ fill: "picture", picture: data.url });
    } finally {
      setUploading(false);
    }
  };

  /** Saves the goal or the report switch; says why when it can't. */
  const saveNight = async (body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch("/api/mmr/card", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (!res?.ok) {
      const err = (await res?.json().catch(() => ({})))?.error;
      toast.error(err === "pro_required" ? "Tonight's goal and the weekly report are part of GS Pro." : err === "bad_goal" ? `Type a number from 1 to ${fmtMmr(GOAL_MAX)}.` : err === "not_ready" ? "This needs a quick update on our side first. Try again later." : "Couldn't save that. Try again?");
      return false;
    }
    const data = (await res.json()) as { card: MmrCardView };
    setCard(data.card);
    setGoal(data.card.goal);
    setWeekly(data.card.weeklyReport);
    return true;
  };
  const setGoalNow = async () => {
    const mmr = cleanGoal(goalInput);
    if (mmr == null) { toast.error(`Type a number from 1 to ${fmtMmr(GOAL_MAX)}.`); return; }
    setSavingGoal(true);
    const ok = await saveNight({ goal: { mmr, game: look.game } });
    setSavingGoal(false);
    if (ok) { toast.success(`Goal set: ${fmtMmr(mmr)} tonight.`); track(EVENTS.mmrGoalSet, { game: look.game }); }
  };
  const clearGoal = async () => {
    if (await saveNight({ goal: null })) { toast.success("Goal cleared."); setGoalInput(""); }
  };
  // The goal's lines read the real card, never the preview's tried moments.
  const realView = useMemo(() => (found ? viewOf(found.source) : null), [found]);
  const base = realView ?? preview.view;
  const goalSuggest = base.next?.at ?? (base.mmr != null ? Math.ceil((base.mmr + 200) / 100) * 100 : 15000);
  const goalNow = activeGoal != null && realView ? goalProgress(activeGoal, realView.mmr, realView.mmr != null ? realView.mmr - realView.tonight.delta : null) : null;
  const goalLine = activeGoal != null
    ? `${goalNow ? `Your card shows "${goalText(goalNow)}" tonight.` : `Your goal tonight is ${fmtMmr(activeGoal)}.`} It clears itself tomorrow unless you keep it.`
    : goal && goal.game === look.game
      ? `Your last goal, ${fmtMmr(goal.mmr)}, has cleared. Set one for tonight.`
      : `Pick a number for the night, like your next division at ${fmtMmr(goalSuggest)}. Your card and OBS link show how far there is to go, with a moment when you get there.`;

  // Share the night: only for a lounge player this account confirmed in this game.
  const link = links.find((l) => l.game === look.game) ?? null;
  const shareRecap = useMemo(() => (link && found && found.playerId === link.playerId ? nightFor(found.source)?.recap ?? null : null), [link, found]);

  const obsUrl = card ? `${origin}/mmr/${card.token}` : null;
  const copyRecap = async () => {
    if (!obsUrl) return;
    try { await navigator.clipboard.writeText(`${obsUrl}?view=recap`); toast.success("Recap link copied."); track(EVENTS.mmrCardLinkCopied, { layout: "recap" }); }
    catch { toast.error("Couldn't copy. Select the link and copy it instead."); }
  };
  const copyLink = async () => {
    if (!obsUrl) return;
    try { await navigator.clipboard.writeText(obsUrl); toast.success("OBS link copied."); track(EVENTS.mmrCardLinkCopied, { layout: look.layout }); }
    catch { toast.error("Couldn't copy. Select the link and copy it instead."); }
  };
  const newLink = async () => {
    const ok = await confirm({ title: "Make a new OBS link?", body: "The old link stops working, so any OBS source using it needs the new one.", confirmLabel: "Make a new link" });
    if (!ok) return;
    const res = await fetch("/api/mmr/card", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
    if (res.ok) { setCard(((await res.json()) as { card: MmrCardView }).card); toast.success("New link made."); }
  };

  const addLook = () => {
    if (!pro || looks.length >= MAX_LOOKS.pro) return;
    const id = `look-${Date.now().toString(36).slice(-6)}`;
    const next: MmrLook = { ...look, id, name: `Look ${looks.length + 1}` };
    setLooks((ls) => [...ls, next]);
    setActiveId(id);
  };
  const removeLook = async (id: string) => {
    if (looks.length <= 1) return;
    const target = looks.find((l) => l.id === id);
    const ok = await confirm({ title: `Delete ${target?.name ?? "this look"}?`, confirmLabel: "Delete look" });
    if (!ok) return;
    const rest = looks.filter((l) => l.id !== id);
    setLooks(rest);
    if (activeId === id) setActiveId(rest[0].id);
  };

  const lookupLine = {
    idle: "Type your name exactly as it shows on MKCentral's lounge.",
    looking: "Looking you up…",
    not_found: `No lounge player by that name in ${MMR_GAMES[look.game].short}. Check the spelling, or pick the game you play.`,
    unavailable: "The lounge isn't answering right now. Try again in a minute.",
    found: found ? `Found ${found.source.name}: ${found.source.mmr != null ? `${fmtMmr(found.source.mmr)} MMR` : "no MMR yet"}${found.source.division ? `, ${found.source.division}` : ""}, ${found.events} events this season.` : "",
  }[lookup];

  const lookChoices = (
    <>
      {LOOK_CHOICES.map((c) => {
        const free = c.opts.filter((o) => !o.pro);
        const paid = c.opts.filter((o) => o.pro);
        return (
          <fieldset key={c.id} className="mmr-studio__set">
            <legend>{c.label}</legend>
            <div className="mmr-studio__chips">
              {free.map((o) => <Chip key={String(o.v)} label={o.label} clickable selected={look[c.id] === o.v} onClick={() => pickValue(c.id, o.v)} />)}
            </div>
            {paid.length > 0 && (
              <div className="mmr-studio__chips mmr-studio__chips--pro">
                <span className="mmr-studio__pro">GS Pro</span>
                {paid.map((o) => <Chip key={String(o.v)} label={o.label} clickable selected={look[c.id] === o.v} onClick={() => pickValue(c.id, o.v)} />)}
              </div>
            )}
            {c.id === "colors" && look.colors === "accent" && (
              <ColorPicker aria-label="Your accent" value={PROFILE_ACCENTS.find((a) => a.key === look.accent)?.color} allowCustom={false} variant="inline" size="small"
                presets={PROFILE_ACCENTS.map((a) => ({ value: a.color, label: a.label }))}
                onChange={(hex) => { const a = PROFILE_ACCENTS.find((x) => x.color.toLowerCase() === hex.toLowerCase()); if (a) setLook({ accent: a.key }); }} />
            )}
            {c.id === "colors" && look.colors === "custom" && (
              <div className="mmr-studio__pair">
                <span className="mmr-studio__swatch"><span>Glow</span><ColorPicker aria-label="Glow color" value={look.custom[0]} allowCustom variant="popover" size="small" onChange={(hex) => setLook({ custom: [hex, look.custom[1]] })} /></span>
                <span className="mmr-studio__swatch"><span>Highlight</span><ColorPicker aria-label="Highlight color" value={look.custom[1]} allowCustom variant="popover" size="small" onChange={(hex) => setLook({ custom: [look.custom[0], hex] })} /></span>
              </div>
            )}
            {c.id === "layout" && look.layout === "rolling" && <MmrRollingControls look={look} onRolling={(rolling) => setLook({ rolling })} />}
            {c.id === "fill" && look.fill === "picture" && (
              <div className="mmr-studio__upload">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
                <Button size="small" variant="secondary" loading={uploading} disabled={!pro} onClick={() => fileRef.current?.click()}>{look.picture ? "Change picture" : "Upload a picture or GIF"}</Button>
                <span>PNG, JPG, WebP or GIF, up to 4 MB. It sits under a dark layer so the numbers stay readable.</span>
              </div>
            )}
          </fieldset>
        );
      })}
    </>
  );

  return (
    <div className="mmr-studio">
      {font && <link rel="stylesheet" href={font} />}

      <section className="mmr-studio__who" aria-labelledby="mmr-who">
        <h2 id="mmr-who">Your lounge name</h2>
        <form className="mmr-studio__find" onSubmit={(e) => { e.preventDefault(); void findMe(); }}>
          <div className="mmr-studio__field">
            <label htmlFor="mmr-name">MKCentral lounge name</label>
            <Input id="mmr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your lounge name" autoComplete="off" maxLength={40} fullWidth />
          </div>
          <div className="mmr-studio__field">
            <Select id="mmr-game" floatingLabel="Game" fullWidth value={look.game} onChange={(v) => setLook({ game: v as MmrGame })} options={MMR_GAME_IDS.map((g) => ({ value: g, label: MMR_GAMES[g].label }))} />
          </div>
          <Button type="submit" variant="primary" iconBefore={IconSearch} loading={lookup === "looking"}>Find me</Button>
        </form>
        <p className={`mmr-studio__note${lookup === "not_found" || lookup === "unavailable" ? " mmr-studio__note--warn" : ""}`} role="status">{lookupLine}</p>
      </section>

      <section className="mmr-studio__goal" aria-labelledby="mmr-goal">
        <h2 id="mmr-goal">Tonight&apos;s goal</h2>
        {pro ? (
          <>
            <form className="mmr-studio__goalform" onSubmit={(e) => { e.preventDefault(); void setGoalNow(); }}>
              <div className="mmr-studio__field">
                <label htmlFor="mmr-goal-input">Goal MMR in {MMR_GAMES[look.game].short}</label>
                <Input id="mmr-goal-input" inputMode="numeric" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder={`For example ${fmtMmr(goalSuggest)}`} autoComplete="off" maxLength={7} fullWidth />
              </div>
              <Button type="submit" variant="primary" iconBefore={IconTargetArrow} loading={savingGoal}>{activeGoal != null ? "Change goal" : "Set goal"}</Button>
              {activeGoal != null && <Button type="button" variant="ghost" onClick={() => void clearGoal()}>Clear goal</Button>}
            </form>
            <p className="mmr-studio__note" role="status">{goalLine}</p>
            <div className="mmr-studio__switches">
              <Switch label="Keep my goal after tonight" checked={!!goal?.keep} disabled={!goal} onChange={(e) => { const keep = e.target.checked; void saveNight({ goalKeep: keep }).then((ok) => { if (ok) toast.success(keep ? "Your goal stays until you clear it." : "Your goal clears itself tomorrow."); }); }} />
            </div>
            <h3 className="mmr-studio__sub">Weekly report</h3>
            <div className="mmr-studio__switches">
              <Switch label="Send me a lounge report every Monday" checked={weekly} onChange={(e) => { const on = e.target.checked; setWeekly(on); void saveNight({ weeklyReport: on }).then((ok) => { if (!ok) setWeekly(!on); else { toast.success(on ? "Weekly report on." : "Weekly report off."); track(EVENTS.loungeWeeklySwitched, { on }); } }); }} />
            </div>
            <p className="mmr-studio__note">
              {links.length
                ? "By email and as a notification: last week's MMR change, record, best night, division changes and the rivals you met most."
                : <>It needs your lounge name confirmed by Discord. <Link href="/lounge">Confirm it on the lounge page</Link>.</>}
            </p>
          </>
        ) : (
          <ProTrialPrompt compact from="mmr-goal" title="Tonight's goal and the weekly report are part of GS Pro">
            <p>Set a number for the night and your card and OBS link track it (&ldquo;184 to 15,500&rdquo;), with a moment when you reach it. Every Monday, a report of your lounge week by email.</p>
          </ProTrialPrompt>
        )}
      </section>

      <div className="mmr-studio__grid">
        <div className="mmr-studio__view">
          <div className="mmr-studio__stage">
            <div className="mmr-frame" tabIndex={0} role="region" aria-label="Preview of your MMR card" ref={previewRef}>
              <MmrCard view={preview.view} look={look} play={preview.play} goal={activeGoal} />
            </div>
          </div>
          <div className="mmr-studio__try" role="group" aria-label="Try a moment">
            <span>Try a moment:</span>
            {(["win", "loss", "rankup"] as PreviewMoment[]).map((k) => (
              <Button key={k} size="small" variant="secondary" iconBefore={IconPlayerPlay} onClick={() => preview.tryMoment(k)}>{k === "win" ? "A win" : k === "loss" ? "A loss" : "A new division"}</Button>
            ))}
            {activeGoal != null && preview.view.mmr != null && preview.view.mmr < activeGoal && (
              <Button size="small" variant="secondary" iconBefore={IconPlayerPlay} onClick={() => preview.tryMoment("goal")}>Reaching the goal</Button>
            )}
            <Button size="small" variant="ghost" iconBefore={IconRefresh} onClick={preview.reset}>Reset</Button>
          </div>
          {!found && <p className="mmr-studio__note">The preview plays a made-up night until your lounge name is found.</p>}
          {usedPro.length > 0 && !pro && (
            <ProTrialPrompt compact from="mmr-card" title={`${usedPro.join(", ")} ${usedPro.length === 1 ? "is" : "are"} part of GS Pro`}>
              <p>Try anything here. Your saved card keeps its free looks until you have GS Pro.</p>
            </ProTrialPrompt>
          )}
        </div>

        <div className="mmr-studio__ctl">
          <Tabs
            variant="underline"
            className="mmr-studio__tabs"
            activeTab={tab}
            onChange={setTab}
            tabs={[
              { id: "look", label: "Look", content: <div className="mmr-studio__pane">{lookChoices}</div> },
              { id: "info", label: "What's on the card", content: <div className="mmr-studio__pane"><MmrWhatsOn look={look} pro={pro} lineWarn={lineWarn} onInfo={(info) => setLook({ info })} /></div> },
              { id: "moments", label: "Moments", content: <div className="mmr-studio__pane"><MmrMoments look={look} pro={pro} onLook={setLook} /></div> },
            ]}
          />
        </div>
      </div>

      <section className="mmr-studio__obs" aria-labelledby="mmr-obs">
        <h2 id="mmr-obs">Add it to OBS</h2>
        {obsUrl ? (
          <>
            <div className="mmr-studio__link">
              <Input value={obsUrl} readOnly aria-label="Your OBS link" fullWidth onFocus={(e) => e.currentTarget.select()} />
              <Button variant="primary" iconBefore={IconCopy} onClick={copyLink}>Copy link</Button>
            </div>
            <ol className="mmr-studio__steps">
              <li>In OBS or Streamlabs, add a Browser source and paste the link.</li>
              <li>Set its size to {obsSize(look, ratio)} for the {look.layout === "rolling" ? `rolling ${look.rolling.shape}` : LOOK_CHOICES[0].opts.find((o) => o.v === look.layout)?.label.toLowerCase()} as it is now. The page behind the card is see-through.</li>
              <li>The card checks the lounge every 30 seconds and plays a moment when a new event is verified, usually a minute or two after the last race.</li>
            </ol>
            <p className="mmr-studio__note">Keep the link private: anyone with it can show your card. <Button variant="ghost" size="small" iconBefore={IconRefresh} onClick={newLink}>Make a new link</Button></p>
            <h3 className="mmr-studio__sub">Night recap</h3>
            {pro ? (
              <>
                <p className="mmr-studio__note">For your ending scene: tonight&apos;s MMR change, record, best event, any new division and tonight&apos;s squares, in this card&apos;s look. Size it {obsSize({ layout: "panel", rolling: look.rolling }, null)}.</p>
                <div className="mmr-studio__link">
                  <Input value={`${obsUrl}?view=recap`} readOnly aria-label="Your night recap link" fullWidth onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="secondary" iconBefore={IconCopy} onClick={copyRecap}>Copy link</Button>
                </div>
              </>
            ) : (
              <p className="mmr-studio__note">A card of tonight&apos;s run for your ending scene is part of GS Pro. <Link href="/gs-pro?from=mmr-recap">See GS Pro</Link></p>
            )}
          </>
        ) : (
          <p className="mmr-studio__note">Your link appears here once your card is saved: find your lounge name or change anything above.</p>
        )}
        {link && (
          <>
            <h3 className="mmr-studio__sub">Share the night</h3>
            <div className="mmr-studio__share">
              <LoungeShareNight game={look.game} name={link.name} recap={shareRecap} />
              <p className="mmr-studio__note">A picture of your latest lounge night in {MMR_GAMES[look.game].short}: the change, your record and any new division, with a link to your lounge page.</p>
            </div>
          </>
        )}
        <div className="mmr-studio__switches">
          <Switch label="Show my card on my GameShuffle profile" checked={showOnProfile} onChange={(e) => setShowOnProfile(e.target.checked)} />
          {status === "error" && <span className="mmr-studio__note mmr-studio__note--warn">Couldn&rsquo;t save the last change. It tries again on your next one.</span>}
        </div>
      </section>

      <section className="mmr-studio__looks" aria-labelledby="mmr-looks">
        <h2 id="mmr-looks">Saved looks</h2>
        <ul className="mmr-studio__look-list">
          {looks.map((l) => (
            <li key={l.id} className={l.id === look.id ? "is-active" : undefined}>
              <div className="mmr-studio__look-name">
                <label htmlFor={`mmr-look-${l.id}`} className="mmr-sr-label">Look name</label>
                <Input id={`mmr-look-${l.id}`} value={l.name} maxLength={40} onChange={(e) => setLooks((ls) => ls.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))} />
              </div>
              <span className="mmr-studio__look-game">{MMR_GAMES[l.game].short}</span>
              {l.id === look.id
                ? <span className="mmr-studio__look-on">Editing · in use</span>
                : <Button size="small" variant="secondary" onClick={() => setActiveId(l.id)}>Use this look</Button>}
              {looks.length > 1 && <Button size="small" variant="ghost" iconBefore={IconTrash} aria-label={`Delete ${l.name}`} onClick={() => removeLook(l.id)}>Delete</Button>}
            </li>
          ))}
        </ul>
        {pro ? (
          <div className="mmr-studio__switches">
            <Button variant="secondary" iconBefore={IconPlus} onClick={addLook} disabled={looks.length >= MAX_LOOKS.pro}>Add a look</Button>
            <Switch label="Switch looks with my Twitch game (a look per game or mode)" checked={followTwitch} onChange={(e) => setFollowTwitch(e.target.checked)} />
          </div>
        ) : (
          <ProTrialPrompt compact from="mmr-card-looks" title="More saved looks are part of GS Pro">
            <p>Keep up to ten looks, one per game or mode. With Twitch connected, your card switches looks when your game changes.</p>
          </ProTrialPrompt>
        )}
      </section>
    </div>
  );
}
