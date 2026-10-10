"use client";

/**
 * The control room's rolls for the game on stream, as lever rows (Lever.tsx)
 * so every button lines up: Mario Kart's race rolls, the streamer's own
 * pick, the match setup and a viewer battle, only where the game has them
 * (just in time). Every button runs the same thing as its chat command, so
 * the result posts in chat and lands on the overlay. `LastRoll` shows what
 * was rolled last in this game.
 */

import { useState } from "react";
import { Button, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { RollSlotArt } from "@/components/twitch/RollSlotArt";
import { formatRelativeTime } from "@/lib/time/relative";
import type { HubGameActions } from "@/lib/hub/gameActions";
import { sliceRaceConfig } from "../tabs/SessionModulesTab";
import { useHubLive } from "./HubLiveProvider";
import { Lever, Levers } from "./Lever";

const ROLL_ERRORS: Record<string, string> = {
  twitch_not_connected: "Connect Twitch in Streaming ▸ Setup first.",
  session_not_found: "This stream isn't live any more.",
};

export function GameRolls({ sessionId, actions, rawRaceConfig, legacyDefaultSlug }: {
  sessionId: string;
  actions: HubGameActions | null;
  rawRaceConfig: Record<string, unknown> | null;
  legacyDefaultSlug: string | undefined;
}) {
  const { data, refresh } = useHubLive();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pickArg, setPickArg] = useState(actions?.pickChoices[0]?.arg ?? "");
  const [setupArg, setSetupArg] = useState(actions?.setup?.choices[0]?.arg ?? "");

  const race = actions?.race ? sliceRaceConfig(rawRaceConfig, actions.slug, legacyDefaultSlug) : null;
  const raceOn = !!actions?.race && race?.enabled !== false;
  const series = race?.defaultSeriesLength ?? 1;
  const lobby = data?.lobby ?? 0;

  const post = async (key: string, url: string, body: Record<string, unknown>) => {
    setBusy(key);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, ...body }) }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok) {
      toast.error(ROLL_ERRORS[out.error] ?? out.error ?? "That didn't go through. Try again.");
      return;
    }
    toast.success("Rolled: it's in chat and on your overlay");
    setTimeout(refresh, 600);
  };
  const raceRoll = (kind: "race" | "rally" | "track" | "items") =>
    void post(kind, "/api/twitch/race/reroll", kind === "race" && series > 1 ? { kind, series } : { kind });
  const hubRoll = (kind: "pick" | "setup" | "battle", arg = "") => void post(kind, "/api/hub/roll", { kind, arg });
  const label = (key: string, text: string) => (busy === key ? "Rolling…" : text);

  return (
    <section className="hub-panel" aria-labelledby="hub-rolls-title">
      <div className="hub-panel__head">
        <h2 id="hub-rolls-title" className="hub-panel__title">Rolls{actions ? <span className="hub-panel__sub"> · {actions.name}</span> : null}</h2>
      </div>
      {actions ? (
        <Levers label={`Rolls for ${actions.name}`}>
          {raceOn && (
            <Lever
              label="Race"
              hint={series > 1 ? `${series}-race series` : undefined}
              actions={
                <>
                  {/* The one primary button on the page: this game's main roll. */}
                  <Button variant="primary" size="small" className="hub-lever__main" onClick={() => raceRoll("race")} disabled={busy !== null}>
                    {label("race", series > 1 ? `Roll ${series} races` : "Roll a race")}
                  </Button>
                  {actions.race?.rally && <Button variant="secondary" size="small" onClick={() => raceRoll("rally")} disabled={busy !== null}>{label("rally", "Rally")}</Button>}
                  <Button variant="secondary" size="small" onClick={() => raceRoll("track")} disabled={busy !== null}>{label("track", "New track")}</Button>
                  <Button variant="secondary" size="small" onClick={() => raceRoll("items")} disabled={busy !== null}>{label("items", "New items")}</Button>
                </>
              }
            />
          )}
          <Lever
            label={`Your ${actions.noun}`}
            option={actions.pickChoices.length > 1 ? (
              <Select
                size="small"
                aria-label={`Which ${actions.noun}`}
                value={pickArg || "any"}
                onChange={(v) => setPickArg(String(v) === "any" ? "" : String(v))}
                options={actions.pickChoices.map((c) => ({ value: c.arg || "any", label: c.label }))}
              />
            ) : undefined}
            actions={
              <Button variant={raceOn ? "secondary" : "primary"} size="small" className="hub-lever__main" onClick={() => hubRoll("pick", pickArg)} disabled={busy !== null}>
                {label("pick", `Roll my ${actions.noun}`)}
              </Button>
            }
          />
          {actions.setup && (
            <Lever
              label="Match setup"
              option={actions.setup.choices.length > 1 ? (
                <Select
                  size="small"
                  aria-label="Which setup"
                  value={setupArg || "default"}
                  onChange={(v) => setSetupArg(String(v) === "default" ? "" : String(v))}
                  options={actions.setup.choices.map((c) => ({ value: c.arg || "default", label: c.label }))}
                />
              ) : undefined}
              actions={
                <Button variant="secondary" size="small" className="hub-lever__main" onClick={() => hubRoll("setup", setupArg)} disabled={busy !== null}>
                  {label("setup", "Roll the setup")}
                </Button>
              }
            />
          )}
          {actions.battle && (
            <Lever
              label="Viewer battle"
              hint={lobby < 2 ? "Needs 2 in the lobby" : `${lobby} in the lobby`}
              actions={
                <Button variant="secondary" size="small" className="hub-lever__main" onClick={() => hubRoll("battle")} disabled={busy !== null || lobby < 2}>
                  {label("battle", "Start a battle")}
                </Button>
              }
            />
          )}
        </Levers>
      ) : (
        <p className="hub-panel__empty">
          This stream is a queue: viewers join with <code>!gs-join</code> and you play in order. Rolls show up here when you play a game GameShuffle can roll for.
        </p>
      )}
    </section>
  );
}

/** The last thing rolled in this game: your pick, a setup, a battle or a race. */
export function LastRoll() {
  const { data } = useHubLive();
  const now = data?.onScreen;
  return (
    <section className="hub-panel" aria-labelledby="hub-lastroll-title">
      <div className="hub-panel__head">
        <h2 id="hub-lastroll-title" className="hub-panel__title">Last roll</h2>
        {now && <span className="hub-panel__meta">{formatRelativeTime(now.at)}</span>}
      </div>
      {!data ? (
        <p className="hub-panel__empty">Loading…</p>
      ) : !now ? (
        <p className="hub-panel__empty">Nothing rolled in this game yet.</p>
      ) : now.kind === "race" ? (
        <p className="hub-lastroll__line">
          <strong>{now.total > 1 ? `Race ${now.index} of ${now.total}` : "Race"}</strong>
          {now.track && <> · {now.track}</>}
          {now.items && <> · {now.items}</>}
        </p>
      ) : (
        <div className="hub-lastroll">
          <p className="hub-lastroll__line"><strong>{now.title ?? `${now.who}'s roll`}</strong></p>
          {now.slots.length > 0 && (
            <ul className="hub-lastroll__slots">
              {now.slots.map((s, i) => (
                <li key={i} className="hub-lastroll__slot">
                  <RollSlotArt slot={s} className="hub-lastroll__art" glyphSize={18} compact />
                  <span className="hub-lastroll__name">{s.name}</span>
                  {s.detail && <span className="hub-lastroll__detail">{s.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
