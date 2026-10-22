/**
 * Picks and bans in the extension: the open round's tracks with a Pick and a
 * Ban button each, saved as the viewer goes (the same ballot /live keeps, so
 * picking here and there is one ballot), then Lock in. Tracks only: item and
 * rally picks stay on the live page. Names only, no art, so it loads fast.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { IconLock, IconSearch } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import type { ExtMyState, ExtPublicState } from "./api";
import { extStore } from "./api";

type Picks = NonNullable<ExtPublicState["picks"]>;

export function PicksCard({ picks, ballot, shared, signIn }: { picks: Picks; ballot: ExtMyState["ballot"]; shared: boolean; signIn: (label: string) => void }) {
  const toast = useToast();
  const [mine, setMine] = useState<{ round: string; picks: string[]; bans: string[] } | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  // The saved ballot shows until the viewer taps something this round; then their taps lead.
  const cur = mine?.round === picks.roundId ? mine : { round: picks.roundId, picks: ballot?.picks ?? [], bans: ballot?.bans ?? [] };
  const locked = !!ballot?.locked;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term ? picks.tracks.filter((t) => t.name.toLowerCase().includes(term)) : picks.tracks;
  }, [picks.tracks, q]);

  const save = (next: { picks: string[]; bans: string[] }, lock = false) =>
    extStore().act({ kind: "ballot", roundId: picks.roundId, picks: next.picks, bans: next.bans, lock });

  const toggle = (id: string, as: "pick" | "ban") => {
    if (!shared) { signIn("pick tracks"); return; }
    if (locked) return;
    const p = new Set(cur.picks), b = new Set(cur.bans);
    const [on, off] = as === "pick" ? [p, b] : [b, p];
    if (on.has(id)) on.delete(id); else { on.add(id); off.delete(id); }
    const next = { round: picks.roundId, picks: [...p], bans: [...b] };
    setMine(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void save(next).then((r) => { if (!r.ok) toast.error(r.error === "round_not_open" ? "This round just closed." : "Couldn't save that. Try again."); });
    }, 800);
  };

  const lockIn = async () => {
    if (!shared) { signIn("lock in your picks"); return; }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setBusy(true);
    const r = await save(cur, true);
    setBusy(false);
    if (r.ok) toast.success("Locked in. The streamer sees the room's top picks.");
    else toast.error(r.error === "round_not_open" ? "This round just closed." : "Couldn't lock that in. Try again.");
  };

  return (
    <section className="ext-picks" aria-label="Picks and bans">
      <div className="ext-picks__head">
        <p className="ext-k">Picks and bans</p>
        <h2 className="ext-title">Pick the tracks you want, ban the ones you don&apos;t</h2>
        <p className="ext-s">
          Your picks {cur.picks.length} · bans {cur.bans.length}
          {picks.locked ? ` · ${picks.locked} locked in` : ""}
        </p>
      </div>

      {locked ? (
        <p className="ext-picks__locked"><IconLock size={16} aria-hidden /> Your picks are locked in.</p>
      ) : (
        <>
          <Input
            size="small"
            fullWidth
            iconBefore={IconSearch}
            placeholder="Find a track"
            aria-label="Find a track"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="ext-picks__list">
            {shown.map((t) => {
              const picked = cur.picks.includes(t.id), banned = cur.bans.includes(t.id);
              return (
                <li key={t.id} className={picked ? "is-picked" : banned ? "is-banned" : undefined}>
                  <span className="ext-picks__name">{t.name}</span>
                  <Button size="small" variant={picked ? "primary" : "secondary"} aria-pressed={picked} aria-label={`Pick ${t.name}`} onClick={() => toggle(t.id, "pick")}>Pick</Button>
                  <Button size="small" variant={banned ? "danger" : "ghost"} aria-pressed={banned} aria-label={`Ban ${t.name}`} onClick={() => toggle(t.id, "ban")}>Ban</Button>
                </li>
              );
            })}
            {!shown.length && <li className="ext-picks__none">No track matches that.</li>}
          </ul>
          <Button variant="primary" fullWidth loading={busy} disabled={!cur.picks.length && !cur.bans.length} onClick={() => void lockIn()}>
            Lock in my picks
          </Button>
        </>
      )}

      {(picks.topPicks.length > 0 || picks.topBans.length > 0) && (
        <div className="ext-picks__room">
          <p className="ext-k">How the room is voting</p>
          {picks.topPicks.length > 0 && <p className="ext-s"><b>Picks:</b> {picks.topPicks.map((t) => `${t.name} (${t.count})`).join(", ")}</p>}
          {picks.topBans.length > 0 && <p className="ext-s"><b>Bans:</b> {picks.topBans.map((t) => `${t.name} (${t.count})`).join(", ")}</p>}
        </div>
      )}
    </section>
  );
}
