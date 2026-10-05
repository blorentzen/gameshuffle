"use client";

/**
 * Game night planner: how many are playing (the roster above), how long you
 * have, which console games you own and the vibe, and AI suggests a lineup of
 * games a live night can run, plus a Jackbox game that fits. Start it as a
 * live night in one tap, or reorder and drop games first. Free with a daily
 * cap for signed-in accounts (POST /api/ai/plan).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Card, Chip, IconButton, Input, Select } from "@empac/cascadeds";
import { IconSparkles, IconX } from "@tabler/icons-react";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { SortableList } from "@/components/ui/SortableList";
import { NIGHT_GAMES } from "@/lib/nights/games";
import { EVENTS, track } from "@/lib/analytics/events";
import { AI_ERRORS } from "@/components/ai/errors";

interface PlanStep { slug: string; label: string; length: number; unit: string; why: string }
interface NightPlan { title: string; steps: PlanStep[]; jackbox: { name: string; pack: string; why: string } | null; summary: string }

const CONSOLE = NIGHT_GAMES.filter((g) => g.kind !== "activity");
const TIMES = [{ value: "45", label: "About 45 minutes" }, { value: "90", label: "About 1.5 hours" }, { value: "150", label: "About 2.5 hours" }, { value: "240", label: "All night (4 hours)" }];

export function NightPlanner() {
  const { players: roster } = useRoster();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [minutes, setMinutes] = useState("90");
  const [own, setOwn] = useState<string[]>(CONSOLE.slice(0, 2).map((g) => g.slug));
  const [vibe, setVibe] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<NightPlan | null>(null);
  const [starting, setStarting] = useState(false);
  const players = Math.max(roster.length, 1);

  const toggle = (slug: string) => setOwn((o) => (o.includes(slug) ? o.filter((x) => x !== slug) : [...o, slug]));

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ players, minutes: Number(minutes), own, vibe }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; plan?: NightPlan; error?: string };
      if (!res.ok || !data.ok || !data.plan) { setError(AI_ERRORS[data.error ?? ""] ?? "That didn't work. Try again in a moment."); return; }
      setPlan(data.plan);
      track(EVENTS.aiPlanGenerated, { players, minutes: Number(minutes) });
      track(EVENTS.toolUsed, { tool: "night-planner" });
    } catch {
      setError("Couldn't reach GameShuffle. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!plan?.steps.length) return;
    setStarting(true);
    const r = await fetch("/api/party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: plan.steps[0].slug, lineup: plan.steps.slice(1).map((s) => s.slug), config: {}, visibility: "secret",
        seats: roster.slice(0, 8).map((p) => ({ name: p.name, isCpu: false, character: null })), hostSeat: null,
      }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setStarting(false);
    if (!r?.ok || !j.code) { toast.error("Couldn't start the night. Please try again."); return; }
    track(EVENTS.nightStarted, { format: "classic", source: "night-planner" });
    router.push(`/party/${j.code}`);
  };

  return (
    <div className="account-card oddone-tool night-planner">
      <p className="bgn-tools__hint">Planning for {players} {players === 1 ? "player" : "players"} (add everyone to the roster above).</p>
      <div className="party-row">
        <Select floatingLabel="How long do you have?" value={minutes} onChange={(v) => setMinutes(String(v))} options={TIMES} />
      </div>
      <p className="party-options__label">Console games you have</p>
      <div className="party-chips">
        {CONSOLE.map((g) => <Chip key={g.slug} clickable selected={own.includes(g.slug)} variant={own.includes(g.slug) ? "primary" : "default"} label={g.short} onClick={() => toggle(g.slug)} />)}
      </div>
      <Input floatingLabel="Anything else? (optional)" placeholder="Competitive crowd, one person is new, end on something silly" value={vibe} maxLength={300} onChange={(e) => setVibe(e.target.value)} />
      <span className="party-row">
        <Button variant="primary" iconBefore={IconSparkles} loading={busy} onClick={() => void ask()}>{plan ? "Plan it again" : "Plan our night"}</Button>
      </span>
      {error && <p className="ai-setup__note is-error" role="status">{error}{error === AI_ERRORS.unauthenticated && <> <Link href={`/login?redirect=${encodeURIComponent("/game-nights/tools/night-planner")}`}>Sign in</Link></>}</p>}

      {plan && (
        <section className="night-planner__plan" aria-label="Your plan">
          <h3 className="party-h3">{plan.title}</h3>
          <p className="bgn-tools__hint">{plan.summary}</p>
          <SortableList items={plan.steps} getId={(s) => s.slug} onReorder={(steps) => setPlan({ ...plan, steps })} handleLabel={(s) => `Reorder ${s.label}`}>
            {(s, handle, i) => (
              <Card variant="outlined" padding="small" className="night-planner__step">
                {handle}
                <span className="night-planner__num">{i + 1}</span>
                <span className="night-planner__body">
                  <strong>{s.label}</strong>
                  <span className="party-muted">{s.length} {s.unit}{s.length === 1 ? "" : "s"} · {s.why}</span>
                </span>
                <IconButton variant="tertiary" size="small" aria-label={`Drop ${s.label}`} onClick={() => setPlan({ ...plan, steps: plan.steps.filter((x) => x.slug !== s.slug) })}><IconX size={16} /></IconButton>
              </Card>
            )}
          </SortableList>
          {plan.jackbox && <p className="bgn-tools__hint"><strong>Got Jackbox?</strong> {plan.jackbox.name} ({plan.jackbox.pack}): {plan.jackbox.why}</p>}
          <span className="party-row">
            {user
              ? <Button variant="primary" loading={starting} disabled={!plan.steps.length || roster.length < 2} onClick={() => void start()}>{roster.length < 2 ? "Add 2 players above to start" : "Start this night on everyone's phones"}</Button>
              : <Link href={`/signup?redirect=${encodeURIComponent("/game-nights/tools/night-planner")}`}>Create a free account to start it as a live night</Link>}
          </span>
          <p className="ai-pack__note">Suggested by AI from your answers. Drag to reorder, or drop anything you don&apos;t fancy.</p>
        </section>
      )}
    </div>
  );
}
