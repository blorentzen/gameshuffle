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
 * Feedback round (2026-10-29): Line up for the Deck card and panel, about a dozen fonts plus any
 * Google Font (checked by /api/mmr/font), any color for "Your color", a border color of its own,
 * and a picture tried from this device (never uploaded) before looks are unlocked.
 * Try before paying (2026-10-29, picks https://claude.ai/artifact/FntRHwbNVFZ1DtC1i1Qff4): visitors build the whole
 * card here without an account (`guest`; kept in this browser by draft.ts, no OBS link until they make one),
 * and anyone without looks who uses a paid look gets "Keep these looks" (KeepLooksPanel) under the preview.
 * Free accounts' paid choices wait in the browser too, since the server saves only their free versions; once
 * looks are on (back from checkout, `checkout`), the studio applies them, saves and uploads the waiting picture.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button, Chip, ColorPicker, Input, Select, Switch, Tabs } from "@empac/cascadeds";
import { LookColorPicker } from "@/components/tools/looks/LookColorPicker";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { IconCopy, IconPlayerPlay, IconPlus, IconRefresh, IconSearch, IconTargetArrow, IconTrash } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { LooksPrompt, looksName, useLooks } from "@/components/billing/LooksOnly";
import { EVENTS, track } from "@/lib/analytics/events";
import { PROFILE_ACCENTS } from "@/lib/profile/accents";
import {
  DEFAULT_LOOK, LOOK_CHOICES, MAX_LOOKS, cleanFontName, proUsed, type MmrEdge, type MmrLook,
} from "@/lib/mmr/look";
import { MMR_GAMES, MMR_GAME_IDS, demoSource, fmtMmr, viewOf, type MmrGame, type MmrSource } from "@/lib/mmr/rules";
import { cleanGoal, goalProgress, goalText, GOAL_MAX } from "@/lib/mmr/goal";
import { nightFor } from "@/lib/lounge/night";
import type { MmrCardView } from "@/lib/mmr/types";
import { MmrCard } from "./MmrCard";
import { LoungeShareNight } from "./LoungeShareNight";
import { useMmrPreview, type PreviewMoment } from "./MmrLive";
import { MmrMoments, MmrRollingControls, MmrWhatsOn } from "./MmrInfoControls";
import { KeepLooksPanel } from "./KeepLooksPanel";
import { clearDraft, clearPicture, draftFor, getPicture, putPicture, readDraft, writeDraft, type DraftPlan } from "@/lib/mmr/draft";

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

const EDGES: { v: MmrEdge; label: string }[] = [{ v: "accent", label: "Accent" }, { v: "white", label: "White" }, { v: "division", label: "Division color" }, { v: "custom", label: "Your color" }];
const ACCENT_PRESETS = PROFILE_ACCENTS.map((a) => ({ value: a.color, label: a.label }));
const HEX = /^#[0-9a-f]{6}$/i;
const PIC_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** The thank-you once looks are on after a checkout from here. */
const thanksFor = (plan: string) =>
  plan === "supporter" ? "Thank you! Supporter looks are on and your card is saved with them."
    : plan === "backer" || plan === "champion" ? "Thank you! GS Pro is on with your support, and your card is saved with every look."
      : "GS Pro is on. Your card is saved with every look.";

/** Back from a checkout this studio opened (/mmr-card?checkout=…&plan=…). */
export interface StudioCheckout { result: "success" | "canceled"; plan: string }

/** `pro` = GS Pro (goal, recap, following Twitch); `looksOk` = GS Pro or Supporter looks (every look choice, more saved looks);
 *  `chat` = GameShuffle's bot answers !mmr in this streamer's chat (the panel's chat line); `guest` = a visitor without
 *  an account; `then` = back from making an account with one of the panel's buttons; `checkout` = back from checkout. */
export function MmrStudio({ initial, pro, looksOk: looksAtLoad = pro, chat = false, avatar, links = [], guest = false, userId = null, then = null, checkout = null }: {
  initial: MmrCardView | null; pro: boolean; looksOk?: boolean; chat?: boolean; avatar: string | null; links?: StudioLink[];
  guest?: boolean; userId?: string | null; then?: DraftPlan | null; checkout?: StudioCheckout | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  // Looks can turn on while the page is open (a checkout's webhook landing a moment after the return).
  const [looksOk, setLooksOk] = useState(looksAtLoad);
  // The browser's draft has been read (so writing it can't overwrite it with the defaults), and a tried picture waits in it.
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [hasPic, setHasPic] = useState(false);
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
  // A picture tried before looks are unlocked: an object URL on this device, never uploaded or saved.
  const [tryPic, setTryPic] = useState<string | null>(null);
  useEffect(() => () => { if (tryPic) URL.revokeObjectURL(tryPic); }, [tryPic]);
  // "Any Google Font": what's typed, and the last check.
  const [fontInput, setFontInput] = useState("");
  const [fontBusy, setFontBusy] = useState(false);
  const [fontMsg, setFontMsg] = useState<string | null>(null);
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
  // What unlocks the paid looks, by name: Supporter looks while that level sells them, else GS Pro.
  const unlockName = looksName(useLooks());
  const setLook = (patch: Partial<MmrLook>) => setLooks((ls) => ls.map((l) => (l.id === look.id ? { ...l, ...patch } : l)));

  // Saves the looks and switches (the name saves when it's found).
  const payload = useMemo(() => ({ looks, activeLook: activeId, followTwitch, showOnProfile }), [looks, activeId, followTwitch, showOnProfile]);
  const lastFreeNote = useRef("");
  const { status } = useAutosave(payload, async (v) => {
    // A visitor's card is kept in this browser (the draft effect below), not on the server.
    if (guest) return true;
    const res = await fetch("/api/mmr/card", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
    if (!res.ok) return false;
    const data = (await res.json()) as { card: MmrCardView; freeSaved: string[]; lineRefused?: boolean };
    setCard(data.card);
    setLineWarn(!!data.lineRefused);
    const note = data.freeSaved.join(", ");
    if (note && note !== lastFreeNote.current) toast.info(`Saved with free looks. ${note} ${data.freeSaved.length === 1 ? "needs" : "need"} ${unlockName}.`);
    lastFreeNote.current = note;
    return true;
  }, { toast: guest ? false : undefined });

  // Finds the player in the look's game and pins the name.
  const findMe = async (game: MmrGame = look.game, quiet = false, asName?: string) => {
    const n = (asName ?? name).trim();
    if (!n) { setLookup("idle"); setFound(null); return; }
    setLookup("looking");
    try {
      const res = await fetch(`/api/mmr/lookup?name=${encodeURIComponent(n)}&game=${game}`);
      const data = await res.json();
      if (!data.ok) { setLookup(data.reason === "not_found" ? "not_found" : "unavailable"); setFound(null); return; }
      setFound({ source: { ...data.source, avatar }, playerId: data.playerId, events: data.eventsPlayed });
      setLookup("found");
      if (!guest && (card?.loungeName ?? "") !== n) {
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
  // The preview shows a tried picture; the saved look never carries it.
  const previewLook = !looksOk && look.fill === "picture" && tryPic ? { ...look, picture: tryPic } : look;

  const pickValue = (id: keyof MmrLook, v: string | boolean) => setLook({ [id]: v } as Partial<MmrLook>);

  useEffect(() => {
    const el = previewRef.current?.querySelector<HTMLElement>(".mmr");
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (el.offsetWidth) setRatio(el.offsetHeight / el.offsetWidth); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [look.layout, look.rolling.shape]);

  const tryPicture = (file: File) => {
    if (!PIC_TYPES.includes(file.type)) { toast.error("Use a PNG, JPG, WebP or GIF."); return; }
    if (file.size > 4 * 1024 * 1024) { toast.error("That picture is over 4 MB."); return; }
    setTryPic(URL.createObjectURL(file));
    // Kept on this device so it can be uploaded once looks are on (never before).
    void putPicture(file).then((kept) => setHasPic(kept));
  };

  const checkFont = async () => {
    const n = cleanFontName(fontInput || look.fontName);
    if (n.length < 2) { setFontMsg("Type a font's name as Google Fonts spells it."); return; }
    setFontBusy(true);
    try {
      const res = await fetch(`/api/mmr/font?name=${encodeURIComponent(n)}`);
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; name?: string; weight?: number; error?: string };
      if (data.ok && data.name && data.weight) {
        setLook({ font: "google", fontName: data.name, fontWeight: data.weight });
        setFontInput(data.name);
        setFontMsg(`Using ${data.name}.`);
      } else {
        setFontMsg(data.error === "not_found" ? `Google Fonts has no font called ${n}. Check the spelling on fonts.google.com.` : data.error === "slow_down" ? "That's a lot of fonts at once. Try again in a minute." : "Couldn't check that font. Try again?");
      }
    } catch {
      setFontMsg("Couldn't check that font. Try again?");
    } finally {
      setFontBusy(false);
    }
  };

  /** Uploads a picture to our storage (looks only); its address, or null after saying why. */
  const uploadPicture = async (file: File | Blob): Promise<string | null> => {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/mmr/picture", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error === "too_big" ? "That picture is over 4 MB." : data.error === "bad_type" ? "Use a PNG, JPG, WebP or GIF." : data.error === "pro_required" ? `Your own picture is part of ${unlockName}.` : "Couldn't upload that picture. Try again?");
      return null;
    }
    return typeof data.url === "string" ? data.url : null;
  };
  const upload = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadPicture(file);
      if (url) setLook({ fill: "picture", picture: url });
    } finally {
      setUploading(false);
    }
  };

  // ── Try before paying: the card kept in this browser ─────────────────────
  const owner = guest ? null : userId;
  const keepDraft = () => writeDraft({ owner, loungeName: name.trim(), looks, activeLook: activeId, picture: hasPic });

  // Once, after hydration: the browser's draft. A visitor's own; an account's own (paid looks waiting through
  // checkout); a visitor's draft for an account only when it came here from the panel's button (`then`) or has
  // no saved card yet, so an old draft never replaces a saved card. Then the URL loses its one-time params.
  const draftRead = useRef(false);
  useEffect(() => {
    if (draftRead.current) return;
    draftRead.current = true;
    const stored = draftFor(readDraft(), owner);
    const d = stored && (guest || stored.owner === owner || then || !initial) ? stored : null;
    if (d) {
      setLooks(d.looks);
      setActiveId(d.activeLook);
      if (d.loungeName) setName(d.loungeName);
      const game = (d.looks.find((l) => l.id === d.activeLook) ?? d.looks[0]).game;
      gameRef.current = game;
      if (d.loungeName) void findMe(game, true, d.loungeName);
      if (d.picture) void getPicture().then((b) => { if (b) { setHasPic(true); setTryPic(URL.createObjectURL(b)); } });
    }
    setDraftLoaded(true);
    if (!guest && then === "free") toast.success("Your card is saved. Your OBS link is below.");
    if (checkout?.result === "canceled") toast.info("Checkout closed. Your card is saved with free looks, and your paid looks are still here.");
    if (checkout?.result === "success" && looksAtLoad) toast.success(thanksFor(checkout.plan));
    if (then || checkout) {
      const url = new URL(window.location.href);
      for (const k of ["then", "checkout", "plan", "session_id"]) url.searchParams.delete(k);
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the draft current: always for a visitor; for an account without looks only while paid looks are in use
  // (they'd be lost through checkout otherwise); never once looks are on.
  useEffect(() => {
    if (!draftLoaded) return;
    const paidInUse = hasPic || looks.some((l) => proUsed(l).length > 0);
    if (guest || (!looksOk && paidInUse)) writeDraft({ owner, loungeName: name.trim(), looks, activeLook: activeId, picture: hasPic });
    else clearDraft();
  }, [draftLoaded, guest, looksOk, looks, activeId, name, hasPic, owner]);

  // Back from checkout before Stripe's confirmation reached us: check every few seconds for a minute, then save the
  // looks in full (autosave already counts them as saved, from when the server could only keep the free versions).
  const waited = useRef(false);
  useEffect(() => {
    if (waited.current || guest || looksAtLoad || checkout?.result !== "success") return;
    waited.current = true;
    toast.info("Checkout done. Your looks unlock as soon as Stripe confirms it, usually within a minute.");
    let tries = 0;
    const id = window.setInterval(async () => {
      tries += 1;
      const res = await fetch("/api/mmr/card", { cache: "no-store" }).catch(() => null);
      const data = res?.ok ? ((await res.json().catch(() => null)) as { looks?: boolean } | null) : null;
      if (data?.looks) {
        window.clearInterval(id);
        setLooksOk(true);
        await fetch("/api/mmr/card", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payloadRef.current) }).catch(() => null);
        toast.success(thanksFor(checkout.plan));
      } else if (tries >= 20) {
        window.clearInterval(id);
        toast.info("Stripe is still confirming. Your looks wait in this browser; open this page again in a few minutes.");
      }
    }, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const payloadRef = useRef(payload);
  useEffect(() => { payloadRef.current = payload; });

  // Looks are on and a tried picture waits on this device: upload it into the looks that use a picture, then let it go.
  useEffect(() => {
    if (guest || !looksOk || !hasPic) return;
    let gone = false;
    void getPicture().then(async (blob) => {
      if (!blob || gone) return;
      const url = await uploadPicture(blob);
      if (!url || gone) return;
      setLooks((ls) => ls.map((l) => (l.fill === "picture" && !l.picture ? { ...l, picture: url } : l)));
      setHasPic(false);
      setTryPic(null);
      await clearPicture();
    });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guest, looksOk, hasPic]);

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
    if (!looksOk || looks.length >= MAX_LOOKS.pro) return;
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
                <span className="mmr-studio__pro">{unlockName}</span>
                {paid.map((o) => <Chip key={String(o.v)} label={o.label} clickable selected={look[c.id] === o.v} onClick={() => pickValue(c.id, o.v)} />)}
              </div>
            )}
            {c.id === "colors" && look.colors === "accent" && (
              <LookColorPicker label="Your color" presets={ACCENT_PRESETS}
                value={HEX.test(look.accent) ? look.accent : PROFILE_ACCENTS.find((a) => a.key === look.accent)?.color ?? "#5b6cff"}
                onChange={(hex) => { const a = PROFILE_ACCENTS.find((x) => x.color.toLowerCase() === hex.toLowerCase()); setLook({ accent: a ? a.key : hex }); }} />
            )}
            {c.id === "colors" && look.colors === "custom" && (
              <div className="mmr-studio__pair">
                <span className="mmr-studio__swatch"><span>Glow</span><ColorPicker aria-label="Glow color" value={look.custom[0]} allowCustom variant="popover" size="small" onChange={(hex) => setLook({ custom: [hex, look.custom[1]] })} /></span>
                <span className="mmr-studio__swatch"><span>Highlight</span><ColorPicker aria-label="Highlight color" value={look.custom[1]} allowCustom variant="popover" size="small" onChange={(hex) => setLook({ custom: [look.custom[0], hex] })} /></span>
              </div>
            )}
            {c.id === "layout" && look.layout === "rolling" && <MmrRollingControls look={look} onRolling={(rolling) => setLook({ rolling })} />}
            {c.id === "layout" && (look.layout === "deck" || look.layout === "panel") && (
              <div className="mmr-studio__inline" role="group" aria-labelledby="mmr-align-label">
                <span id="mmr-align-label" className="mmr-studio__inline-label">Line up</span>
                <div className="mmr-studio__chips">
                  <Chip label="Left" clickable selected={look.align === "left"} onClick={() => setLook({ align: "left" })} />
                  <Chip label="Center" clickable selected={look.align === "center"} onClick={() => setLook({ align: "center" })} />
                </div>
                <span className="mmr-studio__note">{look.layout === "deck" ? "Where the number sits on the card." : "Where a tile sits when it's the only one."}</span>
              </div>
            )}
            {c.id === "font" && look.font === "google" && (
              <div className="mmr-studio__fontpick">
                <form className="mmr-studio__fontform" onSubmit={(e) => { e.preventDefault(); void checkFont(); }}>
                  <div className="mmr-studio__field">
                    <label htmlFor="mmr-font-name">Google Font name</label>
                    <Input id="mmr-font-name" value={fontInput || look.fontName} onChange={(e) => setFontInput(e.target.value)} placeholder="Orbitron" autoComplete="off" maxLength={40} fullWidth />
                  </div>
                  <Button type="submit" variant="secondary" loading={fontBusy}>Use this font</Button>
                </form>
                <p className="mmr-studio__note" role="status">{fontMsg ?? (look.fontName ? `Using ${look.fontName}.` : "Any family on Google Fonts, spelled the way it's spelled there.")}{" "}<ArrowLink href="https://fonts.google.com" external>Browse Google Fonts</ArrowLink></p>
              </div>
            )}
            {c.id === "border" && look.border === "one" && (
              <div className="mmr-studio__inline" role="group" aria-labelledby="mmr-edge-label">
                <span id="mmr-edge-label" className="mmr-studio__inline-label">Border color</span>
                <div className="mmr-studio__chips">
                  {EDGES.map((e) => <Chip key={e.v} label={e.label} clickable selected={look.edge === e.v} onClick={() => setLook({ edge: e.v })} />)}
                </div>
                {look.edge === "custom" && <LookColorPicker label="Border color" presets={[{ value: "#ffd25a", label: "Gold" }, ...ACCENT_PRESETS]} value={look.edgeColor} onChange={(hex) => setLook({ edgeColor: hex })} />}
              </div>
            )}
            {c.id === "fill" && look.fill === "picture" && (
              <div className="mmr-studio__upload">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { if (looksOk) void upload(f); else tryPicture(f); } e.target.value = ""; }} />
                <Button size="small" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
                  {looksOk ? (look.picture ? "Change picture" : "Upload a picture or GIF") : tryPic ? "Try another picture" : "Try a picture or GIF"}
                </Button>
                <span>{looksOk ? "PNG, JPG, WebP or GIF, up to 4 MB. It sits under a dark layer so the numbers stay readable." : `See it on your card here. It stays on this device: nothing uploads until you have ${unlockName}.`}</span>
              </div>
            )}
          </fieldset>
        );
      })}
    </>
  );

  return (
    <div className="mmr-studio">

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

      {!guest && <section className="mmr-studio__goal" aria-labelledby="mmr-goal">
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
      </section>}

      <div className="mmr-studio__grid">
        <div className="mmr-studio__view">
          <div className="mmr-studio__stage">
            <div className="mmr-frame" tabIndex={0} role="region" aria-label="Preview of your MMR card" ref={previewRef}>
              <MmrCard view={preview.view} look={previewLook} play={preview.play} goal={activeGoal} chat={chat} />
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
          {!looksOk && (usedPro.length > 0 || then === "pro" || then === "supporter" || then === "backer") && (
            <KeepLooksPanel used={usedPro} guest={guest} autoPlan={guest ? null : then} beforeLeave={keepDraft} />
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
              { id: "info", label: "What's on the card", content: <div className="mmr-studio__pane"><MmrWhatsOn look={look} pro={looksOk} chat={chat} lineWarn={lineWarn} onInfo={(info) => setLook({ info })} onLook={setLook} /></div> },
              { id: "moments", label: "Moments", content: <div className="mmr-studio__pane"><MmrMoments look={look} pro={pro} onLook={setLook} /></div> },
            ]}
          />
        </div>
      </div>

      {guest ? (
        <section className="mmr-studio__obs" aria-labelledby="mmr-obs">
          <h2 id="mmr-obs">Add it to OBS</h2>
          <p className="mmr-studio__note">Make a free account to get your OBS link. Your card comes with you: it&apos;s kept in this browser until then.</p>
          <div><Button variant="primary" onClick={() => { keepDraft(); window.location.assign(`/signup?redirect=${encodeURIComponent("/mmr-card?then=free")}`); }}>Make a free account</Button></div>
        </section>
      ) : (
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
      )}

      {!guest && <section className="mmr-studio__looks" aria-labelledby="mmr-looks">
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
        {looksOk ? (
          <div className="mmr-studio__switches">
            <Button variant="secondary" iconBefore={IconPlus} onClick={addLook} disabled={looks.length >= MAX_LOOKS.pro}>Add a look</Button>
            {pro && <Switch label="Switch looks with my Twitch game (a look per game or mode)" checked={followTwitch} onChange={(e) => setFollowTwitch(e.target.checked)} />}
          </div>
        ) : (
          <LooksPrompt compact from="mmr-card-looks" what="More saved looks">
            <p>Keep up to ten looks, one per game or mode. With GS Pro and Twitch connected, your card also switches looks when your game changes.</p>
          </LooksPrompt>
        )}
      </section>}
    </div>
  );
}
