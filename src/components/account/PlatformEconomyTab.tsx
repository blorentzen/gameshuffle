"use client";

/**
 * Platform ▸ Token economy ▸ Levers (staff/admin): every number the token
 * economy reads from `gs_economy_config` (grants, earn defaults, daily limits,
 * chaos price band, streamer allowance, stream-end grace), grouped by what it
 * affects, each with what it does and when it last changed. Edit opens a small
 * modal; a save lands straight away (the engine reads the value on every
 * interaction, with a code default as the safety net when a row is missing).
 *
 * Keys without a description here (seeded by a later feature) still show, in
 * "Other settings", so staff can edit them.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Modal } from "@empac/cascadeds";
import { IconBroadcast, IconCoins, IconConfetti, IconHandStop, IconPencil, IconRoute, IconSparkles, IconTrophy, IconUserPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminField, AdminHeader, AdminSection } from "@/components/account/admin/AdminKit";

interface ConfigRow {
  key: string;
  value: number;
  updated_at: string;
}

type LeverCategory = "onboarding" | "earns" | "dailies" | "road" | "chaos" | "streamer" | "lifecycle";

interface LeverMeta {
  key: string;
  label: string;
  helper: string;
  unit: "tokens" | "seconds" | "count" | "xp" | "percent";
  category: LeverCategory;
}

const LEVERS: LeverMeta[] = [
  // ── Welcome and recovery ──────────────────────────────────────
  { key: "grant_start", label: "Welcome grant", unit: "tokens", category: "onboarding",
    helper: "Tokens every new viewer starts with, whether they arrive from chat or make an account. More makes early games feel richer, but adds tokens with every sign-up." },
  { key: "new_community_bonus", label: "New-community bonus", unit: "tokens", category: "onboarding",
    helper: "Tokens a viewer gets the first time they join another streamer's community. Encourages trying other streams. Small on purpose." },
  { key: "grant_onboarding_default", label: "Getting-started reward", unit: "tokens", category: "onboarding",
    helper: "Tokens for each getting-started step an account completes, unless that step has its own amount. 0 turns them off." },
  { key: "bust_recovery_amount", label: "Bust recovery", unit: "tokens", category: "onboarding",
    helper: "Tokens given back when a viewer's wallet drops to the bust floor, so nobody stays stuck at zero. Works with the bust floor below." },
  { key: "bust_floor", label: "Bust floor", unit: "tokens", category: "onboarding",
    helper: "The wallet balance where bust recovery kicks in. Too high and recovery repeats forever; too low and viewers stay stuck." },
  // ── Earning ───────────────────────────────────────────────────
  { key: "earn_t1_default", label: "In-game earn", unit: "tokens", category: "earns",
    helper: "Base tokens for in-game results, like race finishes and tournament wins. A streamer's multiplier stacks on top. Worth more than chat earns." },
  { key: "earn_t2_default", label: "Chat earn", unit: "tokens", category: "earns",
    helper: "Base tokens for chatting during a stream. Kept smaller than in-game earns so chatting never pays more than playing." },
  { key: "t2_first_n_per_session", label: "Chat earns per stream", unit: "count", category: "earns",
    helper: "How many chat earns one viewer can collect in a stream. Stops spam farming without punishing real chatters." },
  { key: "daily_earn_ceiling", label: "Daily earn limit", unit: "tokens", category: "earns",
    helper: "The most a viewer can earn in a day across every kind of earn. Welcome grants don't count. This is the main brake on new tokens." },
  // ── Daily leaderboards (GameShuffle pays; no streamer allowance) ──
  { key: "daily_tokens_per_point", label: "Tokens per Daily point", unit: "tokens", category: "dailies",
    helper: "Tokens for each point a finished Daily Shuffle or Daily Dex earns (10 for guess 1, then 8, 6, 4, 2, and 1 for a last chance). Paid on top of the daily earn limit. 0 turns it off." },
  { key: "daily_board_places", label: "Prize places", unit: "count", category: "dailies",
    helper: "How many places win a prize when a week or month ends. Ties share a place, so more people than this can win." },
  { key: "daily_week_prize_1", label: "Week: 1st place", unit: "tokens", category: "dailies", helper: "Tokens for first place on a week's board, for each game." },
  { key: "daily_week_prize_2", label: "Week: 2nd place", unit: "tokens", category: "dailies", helper: "Tokens for second place on a week's board." },
  { key: "daily_week_prize_3", label: "Week: 3rd place", unit: "tokens", category: "dailies", helper: "Tokens for third place on a week's board." },
  { key: "daily_week_prize_rest", label: "Week: other prize places", unit: "tokens", category: "dailies", helper: "Tokens for each place after third, up to the number of prize places." },
  { key: "daily_month_prize_1", label: "Month: 1st place", unit: "tokens", category: "dailies", helper: "Tokens for first place on a month's board, for each game." },
  { key: "daily_month_prize_2", label: "Month: 2nd place", unit: "tokens", category: "dailies", helper: "Tokens for second place on a month's board." },
  { key: "daily_month_prize_3", label: "Month: 3rd place", unit: "tokens", category: "dailies", helper: "Tokens for third place on a month's board." },
  { key: "daily_month_prize_rest", label: "Month: other prize places", unit: "tokens", category: "dailies", helper: "Tokens for each place after third, up to the number of prize places." },
  { key: "daily_guest_hold_days", label: "Days a guest's tokens are held", unit: "count", category: "dailies",
    helper: "How long tokens a guest earns wait for them to make an account. After this they're gone." },
  { key: "referral_finish_tokens", label: "Invite: a new player finishes", unit: "tokens", category: "dailies",
    helper: "Tokens for the account that shared the link when someone new finishes a daily from it." },
  { key: "referral_signup_tokens", label: "Invite: they make an account", unit: "tokens", category: "dailies",
    helper: "More tokens for the sharer when that player makes a GameShuffle account." },
  { key: "referral_welcome_tokens", label: "Invite: the friend's extra", unit: "tokens", category: "dailies",
    helper: "Added to the new account's welcome tokens when it was made from someone's link." },
  { key: "referral_paid_per_day", label: "Invite: paid players a day", unit: "count", category: "dailies",
    helper: "Most new players (and, separately, sign-ups) an account is paid for in a Pacific day." },
  { key: "referral_new_per_network", label: "Invite: new players a day per network", unit: "count", category: "dailies",
    helper: "Most new players that can count from one network in a day, so one person can't fake many." },
  { key: "referral_link_days", label: "Invite: days a link is remembered", unit: "count", category: "dailies",
    helper: "How long a friend's phone remembers the link they came in on." },
  { key: "daily_help_letter_tokens", label: "Help: a letter of the name", unit: "tokens", category: "dailies",
    helper: "What another letter costs on a daily's last chance." },
  { key: "daily_help_guess_tokens", label: "Help: one more guess", unit: "tokens", category: "dailies",
    helper: "What an extra guess costs on a daily's last chance." },
  { key: "daily_help_letters", label: "Help: letters a day", unit: "count", category: "dailies",
    helper: "Most letters a player can buy for one daily (two always stay hidden, so short names allow fewer). Up to 5." },
  { key: "daily_help_guesses", label: "Help: extra guesses a day", unit: "count", category: "dailies",
    helper: "Most extra guesses a player can buy for one daily. Up to 5." },
  // ── Trainer Road (GameShuffle pays; no streamer allowance) ────
  { key: "road_badge_tokens", label: "Badge", unit: "tokens", category: "road", helper: "Tokens for each badge on a region's path (Alola's grand trials too). Paid once per badge. 0 turns it off." },
  { key: "road_league_tokens", label: "League won", unit: "tokens", category: "road", helper: "Tokens for winning a region's League back to back (Galar's Champion Cup)." },
  { key: "road_region_tokens", label: "Region cleared", unit: "tokens", category: "road", helper: "Tokens for beating a region's end-game opponent, which opens the next region." },
  { key: "road_champion_tokens", label: "Trainer Road Champion", unit: "tokens", category: "road", helper: "Tokens for clearing all nine regions. Paid once." },
  { key: "road_xp_gym", label: "XP: a Gym Leader win", unit: "xp", category: "road", helper: "XP for the first win against a Gym Leader team each month, before stars." },
  { key: "road_xp_rival", label: "XP: a rival win", unit: "xp", category: "road", helper: "XP for the first win against a rival team each month." },
  { key: "road_xp_elite", label: "XP: an Elite Four win", unit: "xp", category: "road", helper: "XP for the first win against an Elite Four team each month." },
  { key: "road_xp_boss", label: "XP: a villain boss win", unit: "xp", category: "road", helper: "XP for the first win against a villain boss team each month." },
  { key: "road_xp_champion", label: "XP: a Champion win", unit: "xp", category: "road", helper: "XP for the first win against a Champion team each month." },
  { key: "road_xp_endgame", label: "XP: an end-game win", unit: "xp", category: "road", helper: "XP for the first win against a region's end-game opponent each month, in place of its tier's." },
  { key: "road_xp_star", label: "XP: each star", unit: "xp", category: "road", helper: "Added to a win's XP for each star it earned (up to three)." },
  { key: "road_xp_hard_percent", label: "XP: Hard", unit: "percent", category: "road", helper: "A Hard win's XP as a percent of the same win in Normal. 150 means half again." },
  { key: "road_xp_badge", label: "XP: a badge", unit: "xp", category: "road", helper: "XP for each badge, on top of the win's own XP." },
  { key: "road_xp_league", label: "XP: a League", unit: "xp", category: "road", helper: "XP for winning a region's League." },
  { key: "road_xp_region", label: "XP: a region cleared", unit: "xp", category: "road", helper: "XP for clearing a region. Clearing all nine at about two stars a win lands near level 60." },
  { key: "road_encounter_swipe", label: "Villain team: tokens swiped", unit: "tokens", category: "road", helper: "What a villain team takes when it turns up on someone's road (or all they have, if less). It comes back when they beat it. 0 means nothing at stake." },
  { key: "road_encounter_tokens", label: "Villain team: reward", unit: "tokens", category: "road", helper: "Tokens for beating a villain team that turned up, on top of getting the swiped tokens back." },
  { key: "road_xp_encounter", label: "XP: a villain team beaten", unit: "xp", category: "road", helper: "XP for beating a villain team that turned up on the road. Like a Gym win by default." },
  { key: "road_encounter_chance", label: "Villain team: grunt chance", unit: "percent", category: "road", helper: "The chance a grunt turns up after a badge (when the next trainer is a Gym Leader). Each region's story battle comes regardless." },
  { key: "road_xp_grunt", label: "XP: a grunt win", unit: "xp", category: "road", helper: "XP for the first win against a grunt team each month in free play." },
  { key: "road_xp_admin", label: "XP: a villain story battle win", unit: "xp", category: "road", helper: "XP for the first win against a villain team's story battle each month in free play." },
  { key: "road_prize_grunt", label: "Prize money: a grunt", unit: "tokens", category: "road", helper: "Tokens for the first win against a grunt team each month." },
  { key: "road_prize_gym", label: "Prize money: a Gym Leader", unit: "tokens", category: "road", helper: "Tokens for the first win against a Gym Leader team each month." },
  { key: "road_prize_rival", label: "Prize money: a rival", unit: "tokens", category: "road", helper: "Tokens for the first win against a rival team each month." },
  { key: "road_prize_admin", label: "Prize money: a villain story battle", unit: "tokens", category: "road", helper: "Tokens for the first win against a villain team's story battle each month." },
  { key: "road_prize_elite", label: "Prize money: the Elite Four", unit: "tokens", category: "road", helper: "Tokens for the first win against an Elite Four team each month." },
  { key: "road_prize_boss", label: "Prize money: a villain boss", unit: "tokens", category: "road", helper: "Tokens for the first win against a villain boss team each month." },
  { key: "road_prize_champion", label: "Prize money: a Champion", unit: "tokens", category: "road", helper: "Tokens for the first win against a Champion team each month." },
  { key: "road_tool_price_patch", label: "Mart: Patch Up", unit: "tokens", category: "road", helper: "What Patch Up costs at the Mart (heals 50 HP on one of your cards)." },
  { key: "road_tool_price_cure", label: "Mart: Cure All", unit: "tokens", category: "road", helper: "What Cure All costs at the Mart (cures every condition on the card on the field)." },
  { key: "road_tool_price_switch", label: "Mart: Quick Switch", unit: "tokens", category: "road", helper: "What Quick Switch costs at the Mart (swaps in a waiting card that still gets the turn's move)." },
  { key: "road_tool_price_power", label: "Mart: Power Up", unit: "tokens", category: "road", helper: "What Power Up costs at the Mart (+30 on the turn's attack)." },
  { key: "road_tool_price_spare", label: "Mart: Spare Energy", unit: "tokens", category: "road", helper: "What Spare Energy costs at the Mart (a second Energy that turn)." },
  { key: "road_tool_price_look", label: "Mart: Look Ahead", unit: "tokens", category: "road", helper: "What Look Ahead costs at the Mart (six Energy and two events ahead for three turns)." },
  { key: "road_tool_price_wind", label: "Mart: Second Wind", unit: "tokens", category: "road", helper: "What Second Wind costs at the Mart (brings back a knocked-out card with half its HP)." },
  { key: "road_bag_max", label: "Bag: most of each tool", unit: "count", category: "road", helper: "How many of each tool a bag holds. An earned tool past this is paid as tokens at its Mart price." },
  { key: "road_tools_duel", label: "Tools a duel", unit: "count", category: "road", helper: "How many tools a player can use in a Trainer Road duel or the Daily Duel (Easy and Normal; never Hard). 0 turns them off there." },
  // ── Chaos prices ──────────────────────────────────────────────
  { key: "chaos_price_min", label: "Lowest chaos price", unit: "tokens", category: "chaos",
    helper: "The least a streamer can charge for a chaos event in chat. Works with the highest price below." },
  { key: "chaos_price_default", label: "Chaos price", unit: "tokens", category: "chaos",
    helper: "What a chaos event costs on every stream for now. Always kept between the lowest and highest price." },
  { key: "chaos_price_max", label: "Highest chaos price", unit: "tokens", category: "chaos",
    helper: "The most a streamer can charge for a chaos event, so chaos never gets too punishing." },
  // ── Streamer payouts ──────────────────────────────────────────
  { key: "streamer_monthly_allowance", label: "Monthly award allowance", unit: "tokens", category: "streamer",
    helper: "Tokens a GS Pro streamer can award each month, unless their plan sets another amount at the start of the month. Streamers never see this number." },
  { key: "party_mission_tokens_per_point", label: "Party mission payout", unit: "tokens", category: "streamer",
    helper: "Tokens per mission point when a streamer confirms a mission on a live Mario Party night (missions are worth 1 to 3 points). Paid from the streamer's monthly allowance." },
  { key: "night_mvp_tokens", label: "Live night MVP payout", unit: "tokens", category: "streamer",
    helper: "Tokens the MVP gets when the host ends a live night. Paid from the host's monthly allowance. 0 turns it off." },
  // ── Streams ───────────────────────────────────────────────────
  { key: "stream_end_grace_seconds", label: "Stream-end grace", unit: "seconds", category: "lifecycle",
    helper: "How long after Twitch says a stream went offline before we end it. A quick drop and reconnect inside this time keeps open predictions alive instead of refunding them." },
];

const CATEGORIES: { id: LeverCategory; title: string; intro: string; icon: typeof IconCoins }[] = [
  { id: "onboarding", title: "Welcome and recovery", intro: "What viewers start with, and what keeps an empty wallet from staying empty.", icon: IconUserPlus },
  { id: "earns", title: "Earning", intro: "How viewers earn tokens by playing and chatting, and the daily limit.", icon: IconSparkles },
  { id: "dailies", title: "Daily leaderboards", intro: "What the Daily Shuffle and Daily Dex pay: tokens for every game, and prizes when a week or month ends. GameShuffle pays these, not streamers.", icon: IconTrophy },
  { id: "road", title: "Trainer Road", intro: "Tokens and XP on the road: badges, Leagues and regions pay tokens once each; wins and milestones give XP for the trainer level. GameShuffle pays these, not streamers.", icon: IconRoute },
  { id: "chaos", title: "Chaos prices", intro: "The range streamers can charge when chat spends tokens on a chaos event.", icon: IconConfetti },
  { id: "streamer", title: "Streamer payouts", intro: "Tokens streamers hand out, which come from their monthly allowance.", icon: IconCoins },
  { id: "lifecycle", title: "Streams", intro: "Timing around the end of a stream.", icon: IconBroadcast },
];

const fmt = (v: number) => v.toLocaleString("en-US");
const valueText = (v: number, unit: LeverMeta["unit"]) =>
  unit === "tokens" ? `${fmt(v)} ${v === 1 ? "token" : "tokens"}` : unit === "seconds" ? `${fmt(v)} ${v === 1 ? "second" : "seconds"}` : unit === "xp" ? `${fmt(v)} XP` : unit === "percent" ? `${fmt(v)}%` : fmt(v);
const UNIT_FIELD: Record<LeverMeta["unit"], string> = { tokens: "tokens", seconds: "seconds", count: "a number", xp: "XP", percent: "a percent" };
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
const humanize = (key: string) => {
  const s = key.replace(/[._]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

interface Editing { key: string; label: string; helper: string; unit: LeverMeta["unit"]; current: number | null; draft: string }

export function PlatformEconomyTab() {
  const [config, setConfig] = useState<ConfigRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/economy-config", { cache: "no-store" });
      if (res.status === 403) {
        setLoadError("This screen is for staff only. Sign in with a staff account.");
        setConfig([]);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setLoadError("Couldn't load the levers. Refresh the page in a moment.");
        setConfig([]);
        return;
      }
      setConfig((body.config as ConfigRow[]) ?? []);
    } catch {
      setLoadError("Couldn't reach the server. Check your connection and refresh.");
      setConfig([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const save = async () => {
    if (!editing) return;
    const value = Number(editing.draft);
    if (editing.draft.trim() === "" || !Number.isInteger(value) || value < 0) {
      setFieldError("Use a whole number, 0 or more.");
      return;
    }
    if (value === editing.current) { setEditing(null); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/economy-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: editing.key, value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        toast.error(`Couldn't save ${editing.label}. Try again.`);
        return;
      }
      toast.success(`Saved: ${editing.label} is now ${valueText(value, editing.unit)}`);
      setEditing(null);
      await load();
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const open = (key: string, label: string, helper: string, unit: LeverMeta["unit"]) => {
    const row = config?.find((r) => r.key === key);
    setFieldError(null);
    setEditing({ key, label, helper, unit, current: row ? row.value : null, draft: row ? String(row.value) : "" });
  };

  const known = new Set(LEVERS.map((l) => l.key));
  const unknown = config?.filter((r) => !known.has(r.key)) ?? [];

  const row = (key: string, label: string, helper: string, unit: LeverMeta["unit"]) => {
    const r = config?.find((c) => c.key === key);
    return (
      <li key={key} className="admin-money-row">
        <div className="admin-money-row__text">
          <p className="admin-money-row__name">{label}</p>
          {helper && <p className="admin-money-row__help">{helper}</p>}
          <p className="admin-money-row__meta">{r ? `Last changed ${when(r.updated_at)}` : "Not set yet: the built-in default applies"}</p>
        </div>
        <span className="admin-money-row__value admin-num">{r ? valueText(r.value, unit) : "Default"}</span>
        <Button variant="ghost" size="small" iconBefore={IconPencil} aria-label={`Edit ${label}`} onClick={() => open(key, label, helper, unit)}>Edit</Button>
      </li>
    );
  };

  return (
    <div className="account-card admin-screen admin-money">
      <AdminHeader
        title="Levers"
        intro="Every number the token economy runs on: welcome grants, earning, chaos prices and streamer payouts. A change applies straight away."
      />

      {loadError && <Alert variant="error" onClose={() => setLoadError(null)}>{loadError}</Alert>}

      {config === null ? (
        <LoadingLines label="Loading the levers" />
      ) : (
        <>
          {CATEGORIES.map((cat) => {
            const list = LEVERS.filter((l) => l.category === cat.id);
            if (list.length === 0) return null;
            const Icon = cat.icon;
            return (
              <AdminSection key={cat.id} title={cat.title} intro={cat.intro} icon={<Icon size={20} />}>
                <ul className="admin-money-list">{list.map((l) => row(l.key, l.label, l.helper, l.unit))}</ul>
              </AdminSection>
            );
          })}

          {unknown.length > 0 && (
            <AdminSection title="Other settings" icon={<IconHandStop size={20} />} intro="Settings a newer feature added that this page doesn't describe yet. Check with a developer what one does before changing it.">
              <ul className="admin-money-list">{unknown.map((r) => row(r.key, humanize(r.key), "", "count"))}</ul>
            </AdminSection>
          )}
        </>
      )}

      <Modal
        isOpen={!!editing}
        onClose={() => { if (!saving) setEditing(null); }}
        title={editing ? `Edit: ${editing.label}` : ""}
        size="small"
        primaryAction={{ label: saving ? "Saving…" : "Save", onClick: () => { if (!saving) void save(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => setEditing(null) }}
      >
        {editing && (
          <form className="admin-form" onSubmit={(e) => { e.preventDefault(); if (!saving) void save(); }}>
            {editing.helper && <p className="admin-money-modal__note">{editing.helper}</p>}
            <AdminField
              label={`New value (${UNIT_FIELD[editing.unit]})`}
              error={fieldError}
              helper={editing.current == null ? "Not set yet: the built-in default applies." : `Now ${valueText(editing.current, editing.unit)}.`}
            >
              {(id, describedBy) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={fieldError ? true : undefined}
                  error={!!fieldError}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={editing.draft}
                  onChange={(e) => { setFieldError(null); setEditing({ ...editing, draft: e.target.value }); }}
                  fullWidth
                  autoFocus
                />
              )}
            </AdminField>
          </form>
        )}
      </Modal>
    </div>
  );
}
