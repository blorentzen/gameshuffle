"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Chip } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { CompetitiveConfig } from "@/lib/competitive/config";

interface MyLounge { id: string; status: string; created_at: string; settings: { mode?: string } | null }

const STATUS_LABEL: Record<string, string> = {
  waiting: "Waiting for players",
  character_select: "Picking characters",
  lobby: "In the lobby",
  in_progress: "Racing",
  complete: "Finished",
};

export function LoungeStarter({
  config,
  games = [],
}: {
  config: CompetitiveConfig;
  /** Every competitive game, for the switcher. One entry hides it. */
  games?: { slug: string; name: string }[];
}) {
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [selectedMode, setSelectedMode] = useState(config.teamModes[0]?.value ?? "ffa");
  const [myLounges, setMyLounges] = useState<MyLounge[]>([]);

  /**
   * A lounge used to be unreachable the moment you closed the tab: nothing on
   * the site listed one, so the share link was the only way back in. This lists
   * the sets you organized or played in so they can be resumed.
   */
  const loadMyLounges = useCallback(async (userId: string) => {
    const supabase = createClient();
    const { data: played } = await supabase.from("lounge_players").select("session_id").eq("user_id", userId);
    const ids = [...new Set((played ?? []).map((r) => r.session_id as string))];
    const { data } = await supabase
      .from("lounge_sessions")
      .select("id, status, created_at, settings, organizer_id")
      .eq("game_slug", config.gameSlug)
      .or(`organizer_id.eq.${userId}${ids.length ? `,id.in.(${ids.join(",")})` : ""}`)
      .order("created_at", { ascending: false })
      .limit(6);
    setMyLounges((data ?? []) as MyLounge[]);
  }, [config.gameSlug]);

  useEffect(() => {
    if (!user) return;
    // Deferred to a microtask: the loader's first state write must not land
    // synchronously inside the effect.
    void Promise.resolve().then(() => loadMyLounges(user.id));
  }, [user, loadMyLounges]);

  const modeInfo = config.teamModes.find((m) => m.value === selectedMode) ?? config.teamModes[0];

  const handleCreateLounge = async () => {
    if (!user) {
      router.push("/signup");
      return;
    }

    setCreating(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("lounge_sessions")
      .insert({
        game_slug: config.gameSlug,
        organizer_id: user.id,
        status: "waiting",
        race_count: config.defaultRaceCount,
        scoring_table: config.pointsTable,
        players: [],
        races: [],
        settings: {
          mode: selectedMode,
          teams: modeInfo?.teams ?? config.lobbySize,
          perTeam: modeInfo?.perTeam ?? 1,
        },
      })
      .select("id")
      .single();

    if (error || !data) {
      // This used to fail silently: the button just stopped and the page sat there.
      console.error("[competitive] lounge create failed:", error?.message);
      toast.error("Couldn't create that lounge. Try again in a moment.");
      setCreating(false);
      return;
    }
    router.push(`/competitive/${config.gameSlug}/lounge/${data.id}`);
    setCreating(false);
  };


  return (
    <>
      {/* Start a set. Game and format are CDS chips (single choice); the
          duplicate scoring preview that sat beside them is gone, since the
          full table lives further down the page. */}
      <section className="cmp-start" id="start" aria-labelledby="cmp-start-title">
        <div className="cmp-start__head">
          <h2 id="cmp-start-title" className="cmp-start__title">Start a lounge</h2>
          <p className="cmp-start__lede">
            One live set, scored as you race. Share the link and everyone logs their own finish.
          </p>
        </div>

        {games.length > 1 && (
          <div className="cmp-start__field">
            <span className="cmp-start__label" id="cmp-game-label">Game</span>
            <div className="cmp-start__chips" role="radiogroup" aria-labelledby="cmp-game-label">
              {games.map((g) => (
                <Chip
                  key={g.slug}
                  label={g.name}
                  size="large"
                  clickable
                  selected={g.slug === config.gameSlug}
                  variant={g.slug === config.gameSlug ? "primary" : "outline"}
                  onClick={() => { if (g.slug !== config.gameSlug) router.push(`/competitive/${g.slug}#start`); }}
                />
              ))}
            </div>
          </div>
        )}

        <div className="cmp-start__field">
          <span className="cmp-start__label" id="cmp-format-label">Format</span>
          <div className="cmp-start__chips" role="radiogroup" aria-labelledby="cmp-format-label">
            {config.teamModes.map((mode) => (
              <Chip
                key={mode.value}
                label={`${mode.label} · ${mode.perTeam === 1 ? `${mode.teams} players` : `${mode.teams} teams`}`}
                size="large"
                clickable
                selected={selectedMode === mode.value}
                variant={selectedMode === mode.value ? "primary" : "outline"}
                onClick={() => setSelectedMode(mode.value)}
              />
            ))}
          </div>
        </div>

        <div className="cmp-start__foot">
          <ul className="cmp-start__facts" aria-label="This set">
            <li>{config.defaultRaceCount} {config.roundLabel}s</li>
            <li>Up to {config.lobbySize} players</li>
            <li>Standard scoring</li>
          </ul>
          <Button variant="primary" size="large" onClick={handleCreateLounge} disabled={creating}>
            {creating ? "Creating…" : `Create ${modeInfo?.label ?? "FFA"} lounge`}
          </Button>
        </div>
        {!user && <p className="cmp-start__note">You will be asked to sign in first. Watching a lounge never needs an account.</p>}
      </section>

      {/* Your lounges — the way back into a set you already started. */}
      {user && myLounges.length > 0 && (
        <section className="cmp-section">
          <h2 className="cmp-section__title">Your lounges</h2>
          <div className="comp-mylounges">
            {myLounges.map((l) => {
              const done = l.status === "complete";
              const mode = (l.settings?.mode ?? "ffa").toUpperCase();
              return (
                <Link key={l.id} href={`/competitive/${config.gameSlug}/lounge/${l.id}`} className="comp-mylounge">
                  <span className="comp-mylounge__main">
                    <span className="comp-mylounge__mode">{mode}</span>
                    <span className={`comp-mylounge__status${done ? " comp-mylounge__status--done" : ""}`}>
                      {STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </span>
                  <span className="comp-mylounge__meta">
                    {new Date(l.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    <span className="comp-mylounge__cta">{done ? "View results" : "Resume"}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
