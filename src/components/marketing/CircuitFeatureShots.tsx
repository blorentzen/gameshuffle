/**
 * Stylized "product shots" for the GS Circuit marquee spotlights — dark panels
 * (matching ProFeatureShots' .pro-shot) that sit in a <ProSpotlight> row on the
 * light page. Representations of the tournament features, not live demos.
 */

const panelText = { color: "#f3f4f6" } as const;
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#aeb4c7", marginBottom: 12 };

/* ── Any format: a lobby-advance ladder ─────────────────────────────── */
const LOBBIES: { name: string; players: [string, string]; winner: 0 | 1 }[] = [
  { name: "Lobby 1", players: ["Maya", "Rex"], winner: 0 },
  { name: "Lobby 2", players: ["Kai", "Nova"], winner: 1 },
  { name: "Lobby 3", players: ["Juno", "Ash"], winner: 0 },
];

export function BracketShot() {
  return (
    <div className="pro-shot" aria-hidden="true">
      <p style={label}>Winners bracket · tap who advances</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {LOBBIES.map((l) => (
          <div key={l.name} style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.03)" }}>
            <div style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "#aeb4c7", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>{l.name}</div>
            {l.players.map((p, i) => {
              const won = i === l.winner;
              return (
                <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: won ? "rgba(99,102,241,0.18)" : "transparent" }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", background: won ? "#6366f1" : "rgba(255,255,255,0.08)", color: won ? "#fff" : "#aeb4c7" }}>{won ? "✓" : ""}</span>
                  <span style={{ ...panelText, flex: 1, fontSize: 14, fontWeight: won ? 700 : 500 }}>{p}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: won ? "#a5b4fc" : "#8a90a3", opacity: won ? 1 : 0.6 }}>{won ? "moves on" : "out"}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Live scoring: standings with tie-aware medals ───────────────────── */
const STANDINGS: { place: string; name: string; pts: number; medal?: string }[] = [
  { place: "1", name: "Nova", pts: 128, medal: "🥇" },
  { place: "2", name: "Maya", pts: 121, medal: "🥈" },
  { place: "2", name: "Kai", pts: 121, medal: "🥈" },
  { place: "4", name: "Juno", pts: 116 },
  { place: "5", name: "Rex", pts: 109 },
];

export function StandingsShot() {
  return (
    <div className="pro-shot" aria-hidden="true">
      <p style={label}>Overall standings · updates live</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {STANDINGS.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", borderRadius: 10, background: i < 3 ? "rgba(255,255,255,0.05)" : "transparent" }}>
            <span style={{ width: 24, textAlign: "center", fontWeight: 800, fontSize: s.medal ? 16 : 14, color: "#f3f4f6" }}>{s.medal ?? s.place}</span>
            <span style={{ ...panelText, flex: 1, fontSize: 14, fontWeight: 600 }}>{s.name}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#a5b4fc" }}>{s.pts} pts</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 11, color: "#8a90a3", marginTop: 12 }}>A tie for 2nd — both officially 2nd, same medal.</p>
    </div>
  );
}
