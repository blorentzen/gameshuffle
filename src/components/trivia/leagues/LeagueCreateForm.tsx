"use client";

/**
 * Start a league: name, where (online or a venue, with the game nights'
 * address search), the first night (it repeats weekly in the host's time
 * zone), season length, team size and how the standings work.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Radio, RadioGroup, Textarea } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { PlaceAutocompleteInput } from "@/components/maps/PlaceAutocompleteInput";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { LEAGUE_TEAM_SIZES, LEAGUE_WEEKS, defaultBestOf, scoringLine } from "@/lib/trivia/leagueRules";
import { TEMPLATES } from "@/lib/trivia/rules";

const ERRORS: Record<string, string> = {
  bad_title: "Give the league a name (2 characters or more).",
  blocked: "That name or description can't be used.",
  bad_date: "Pick a first night that hasn't passed yet.",
  place_required: "Add the venue, or choose Online.",
  circuit_required: "Leagues are part of GS Circuit now. See the plans to start one.",
  series_failed: "Couldn't set up the weekly nights. Try again.",
  not_ready: "Leagues need a quick update on our side first.",
};

export function LeagueCreateForm() {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [where, setWhere] = useState<"venue" | "online">("venue");
  const [place, setPlace] = useState("");
  const [firstAt, setFirstAt] = useState("");
  const [weeks, setWeeks] = useState("8");
  const [teamSize, setTeamSize] = useState("6");
  const [scoring, setScoring] = useState<"place" | "total">("place");
  const [bestOf, setBestOf] = useState<string>("");
  const [template, setTemplate] = useState("bar");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const w = Number(weeks);
  const best = bestOf ? Math.min(Number(bestOf), w) : defaultBestOf(w);
  const line = useMemo(() => scoringLine({ weeks: w, teamSize: Number(teamSize), scoring, bestOf: best, template, online: where === "online" }), [w, teamSize, scoring, best, template, where]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstAt) { toast.error("Pick the first night."); return; }
    setBusy(true);
    const d = await fetch("/api/trivia/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title, description, online: where === "online", place, firstAt: new Date(firstAt).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, weeks: w, teamSize: Number(teamSize), scoring, bestOf: best, template,
      }),
    }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { toast.error(ERRORS[d?.error] ?? "Couldn't start the league. Try again."); return; }
    track(EVENTS.triviaLeagueStarted, { weeks: w, scoring });
    router.push(`/trivia/leagues/${d.league.slug}/manage`);
  };

  return (
    <form className="trivia-card trivia-form league-form" onSubmit={submit}>
      <Input fullWidth floatingLabel="League name" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Tuesday Trivia at Pine Street Taproom" />
      <RadioGroup name="league-where" label="Where" orientation="horizontal" value={where} onChange={(v) => setWhere(v === "online" ? "online" : "venue")}>
        <Radio value="venue" label="At a venue" />
        <Radio value="online" label="Online" />
      </RadioGroup>
      {where === "venue" && <div className="league-form__place"><PlaceAutocompleteInput value={place} onChange={setPlace} onPick={(p) => setPlace(p.address)} placeholder="Venue name or address" /></div>}
      <div className="trivia-form__row">
        <Input fullWidth type="datetime-local" floatingLabel="First night" value={firstAt} onChange={(e) => setFirstAt(e.target.value)} />
        <Select floatingLabel="Season" value={weeks} onChange={(v) => { setWeeks(String(v)); setBestOf(""); }} options={LEAGUE_WEEKS.map((n) => ({ value: String(n), label: `${n} weeks` }))} />
        <Select floatingLabel="Team size" value={teamSize} onChange={(v) => setTeamSize(String(v))} options={LEAGUE_TEAM_SIZES.map((n) => ({ value: String(n), label: `Up to ${n}` }))} />
      </div>
      <p className="trivia-muted">It repeats every week on the same day and time, in your time zone. Each week gets its own game night page.</p>
      <div className="trivia-form__row">
        <Select floatingLabel="Each night" value={scoring} onChange={(v) => setScoring(v === "total" ? "total" : "place")} options={[{ value: "place", label: "Points by place" }, { value: "total", label: "Total score" }]} />
        <Select floatingLabel="Nights that count" value={String(best)} onChange={(v) => setBestOf(String(v))} options={Array.from({ length: w }, (_, i) => w - i).map((n) => ({ value: String(n), label: n === w ? "Every night" : `Best ${n} of ${w}` }))} />
        <Select floatingLabel="Each night starts from" value={template} onChange={(v) => setTemplate(String(v))} options={TEMPLATES.map((t) => ({ value: t.id, label: `${t.label} template` }))} />
      </div>
      <p className="trivia-muted">{line}</p>
      <Textarea fullWidth floatingLabel="About the league (optional)" value={description} maxLength={600} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Prizes, house rules, parking, anything teams should know." />
      <div className="trivia-row">
        <Button type="submit" variant="primary" disabled={busy || title.trim().length < 2 || !firstAt || (where === "venue" && !place.trim())}>{busy ? "Starting…" : "Start the league"}</Button>
      </div>
    </form>
  );
}
