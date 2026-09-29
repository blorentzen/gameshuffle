"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Select } from "@empac/cascadeds";
import { useRoster } from "@/lib/game-nights/companion/roster";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { PROMPT_PACKS } from "@/data/originals/most-likely";
import { dealPrompt } from "@/lib/originals/mostLikely";

/**
 * Most Likely To, one-device edition (a GameShuffle Original): read the prompt,
 * count to three, everyone points. The live-night version votes on everyone's
 * own phone, keeps the votes anonymous and scores reading the room.
 */

const MIXED = "mixed";

export function MostLikelyTo() {
  const { players: roster } = useRoster();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [pack, setPack] = useState(MIXED);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [used, setUsed] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  const next = () => {
    const r = dealPrompt(pack, used);
    setPrompt(r.prompt);
    setUsed((u) => [...u, r.prompt]);
  };

  const playOnPhones = async () => {
    setStarting(true);
    const r = await fetch("/api/party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameSlug: "most-likely-to", config: {}, visibility: "secret", seats: roster.slice(0, 8).map((p) => ({ name: p.name, isCpu: false, character: null })), hostSeat: null }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setStarting(false);
    if (!r?.ok || !j.code) { toast.error("Couldn't start the night. Please try again."); return; }
    router.push(`/party/${j.code}`);
  };

  return (
    <div className="account-card oddone-tool">
      {prompt ? (
        <div className="likely__prompt">
          <span className="oddone__label">Who&apos;s most likely to…</span>
          <strong className="likely__text">{prompt}?</strong>
        </div>
      ) : (
        <p className="bgn-tools__hint">Read the prompt out loud, count to three, and everyone points at who fits it best. Yourself included.</p>
      )}
      <div className="party-row">
        <Select floatingLabel="Prompt pack" value={pack} onChange={(v) => setPack(String(v))}
          options={[{ value: MIXED, label: "Mixed (a random pack)" }, ...PROMPT_PACKS.map((p) => ({ value: p.id, label: p.label }))]} />
        <Button variant="primary" onClick={next}>{prompt ? "Next prompt" : "First prompt"}</Button>
      </div>
      {used.length > 0 && <p className="bgn-tools__hint">{used.length} prompt{used.length === 1 ? "" : "s"} so far. None repeat until the pack runs out.</p>}
      <div className="oddone-tool__phones">
        <p className="bgn-tools__hint"><strong>Want votes and a scoreboard?</strong> Start a live night: everyone votes anonymously on their own phone, the TV shows the reveal, and you score a point each time you match the room&apos;s pick.</p>
        {user
          ? <Button variant="secondary" size="small" disabled={starting || roster.length < 3} onClick={playOnPhones}>{roster.length < 3 ? "Add 3 players above to play on phones" : "Play on everyone's phones"}</Button>
          : <Link href={`/signup?redirect=${encodeURIComponent("/game-nights/tools/most-likely-to")}`}>Create a free account to host on everyone&apos;s phones</Link>}
      </div>
    </div>
  );
}
