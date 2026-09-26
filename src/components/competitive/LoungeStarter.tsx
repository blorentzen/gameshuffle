"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
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

export function LoungeStarter({ config }: { config: CompetitiveConfig }) {
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
      {/* Start a set */}
      <section className="comp-section">
        <div className="comp-card comp-card--highlight">
          <div className="comp-card__content">
            <h2>Start a lounge match</h2>
            <p>
              Create a live scoring session for your next set. Share the link with your opponents.
              Everyone tracks placements in real time, so there are no forgotten scores or screenshot disputes.
            </p>
            <div className="comp-mode-selector">
              <span className="comp-mode-selector__label">Match format</span>
              <div className="comp-mode-selector__options">
                {config.teamModes.map((mode) => (
                  <button
                    key={mode.value}
                    className={`comp-mode-btn ${selectedMode === mode.value ? "comp-mode-btn--active" : ""}`}
                    onClick={() => setSelectedMode(mode.value)}
                  >
                    <span className="comp-mode-btn__label">{mode.label}</span>
                    <span className="comp-mode-btn__desc">
                      {mode.perTeam === 1 ? `${mode.teams} players` : `${mode.teams} teams`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Button variant="primary" onClick={handleCreateLounge} disabled={creating}>
              {creating ? "Creating…" : `Create ${modeInfo?.label ?? "FFA"} lounge`}
            </Button>
          </div>
          <div className="comp-card__aside">
            <div className="comp-scoring-preview">
              <span className="comp-scoring-preview__title">Standard scoring</span>
              <div className="comp-scoring-preview__grid">
                {config.pointsTable.slice(0, 6).map((row) => (
                  <div key={row.place} className="comp-scoring-preview__row">
                    <span>{row.place}</span>
                    <span className="comp-scoring-preview__pts">{row.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Your lounges — the way back into a set you already started. */}
      {user && myLounges.length > 0 && (
        <section className="comp-section">
          <h2 className="comp-section__title">Your lounges</h2>
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
