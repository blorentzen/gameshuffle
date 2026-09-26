/**
 * Stylized product shots for the Mario Kart tournaments page, matching the
 * `.pro-shot` dark panels used by ProFeatureShots and CircuitFeatureShots so
 * the three marketing pages read as one family.
 *
 * These sell the DRAW, not the software. The page's argument is that nobody
 * knows what they are racing until the round opens, so each panel shows a
 * moment of that: the reveal, the pool it was drawn from, the ladder that
 * keeps a bad heat from ending someone's night.
 */

const label: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "#aeb4c7", marginBottom: 12,
};
const panel: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const rowBase: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
  borderRadius: 10, background: "rgba(255,255,255,0.04)",
};

/* ── The draw: three tracks and a build nobody picked ───────────────── */
const DRAWN = [
  { n: 1, track: "Rainbow Road", cup: "Special Cup" },
  { n: 2, track: "Coconut Mall", cup: "Golden Dash" },
  { n: 3, track: "Bowser's Castle", cup: "Special Cup" },
];

export function DrawShot() {
  return (
    <div className="pro-shot" aria-hidden="true">
      <p style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ff5470", boxShadow: "0 0 0 3px rgba(255,84,112,0.22)" }} />
        Round 3 · revealing now
      </p>
      <div style={panel}>
        {DRAWN.map((d) => (
          <div key={d.n} style={rowBase}>
            <span style={{ width: 22, height: 22, display: "grid", placeItems: "center", borderRadius: 6, background: "#1547d1", color: "#fff", fontWeight: 800, fontSize: 12 }}>{d.n}</span>
            <span style={{ color: "#f3f4f6", fontSize: 14, fontWeight: 600 }}>{d.track}</span>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#aeb4c7" }}>{d.cup}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "linear-gradient(90deg, rgba(39,102,236,0.22), rgba(201,73,233,0.18))" }}>
        <span style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", color: "#aeb4c7" }}>Everyone runs</span>
        <span style={{ color: "#f3f4f6", fontSize: 14, fontWeight: 600 }}>Yoshi · Teddy Buggy · Roller · Cloud Glider</span>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12, color: "#fabe23" }}>Drawn from your pool · 148 legal builds</p>
    </div>
  );
}

/* ── The pool: what the organizer put in the hat ────────────────────── */
function Pill({ children, state }: { children: React.ReactNode; state: "on" | "off" | "ban" }) {
  const styles: Record<string, React.CSSProperties> = {
    on: { background: "rgba(39,102,236,0.25)", borderColor: "#2766ec", color: "#f3f4f6" },
    off: { color: "#6f7591", textDecoration: "line-through", borderColor: "rgba(255,255,255,0.12)" },
    ban: { background: "rgba(255,84,112,0.16)", borderColor: "#ff5470", color: "#ff97a8" },
  };
  return (
    <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, border: "1px solid", ...styles[state] }}>
      {children}
    </span>
  );
}

export function PoolShot() {
  return (
    <div className="pro-shot" aria-hidden="true">
      <p style={label}>Weight class</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Pill state="on">Light</Pill><Pill state="on">Medium</Pill><Pill state="off">Heavy</Pill>
      </div>
      <p style={{ ...label, marginTop: 16 }}>Drift</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Pill state="on">Inward</Pill><Pill state="off">Outward</Pill>
      </div>
      <p style={{ ...label, marginTop: 16 }}>Out of the hat</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Pill state="ban">Wiggler</Pill><Pill state="ban">Teddy Buggy</Pill><Pill state="ban">Rainbow Road</Pill>
      </div>
      <p style={{ margin: "16px 0 0", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", fontSize: 13, color: "#aeb4c7" }}>
        <strong style={{ color: "#fabe23", fontSize: 17 }}>148</strong> of 703 combos still in play
      </p>
    </div>
  );
}

/* ── Heat → Mains: the comeback, drawn ──────────────────────────────── */
const LANES: { tag: string; bg: string; fg: string; w: string; up?: string }[] = [
  { tag: "A Main", bg: "#fabe23", fg: "#2a1d00", w: "100%" },
  { tag: "B Main", bg: "#2766ec", fg: "#fff", w: "74%", up: "2 transfer up" },
  { tag: "C Main", bg: "#39406a", fg: "#cdd2ea", w: "52%", up: "2 transfer up" },
];

export function LadderShot() {
  return (
    <div className="pro-shot" aria-hidden="true">
      <p style={label}>Heats feed the mains</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {LANES.map((l) => (
          <div key={l.tag} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 6, minWidth: 62, textAlign: "center", background: l.bg, color: l.fg }}>{l.tag}</span>
            <span style={{ height: 9, width: l.w, borderRadius: 99, background: "linear-gradient(90deg,#2766ec,#c949e9)" }} />
            {l.up && <span style={{ fontSize: 11, color: "#aeb4c7", whiteSpace: "nowrap" }}>{l.up}</span>}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 5, marginTop: 14 }}>
        {["Heat 1", "Heat 2", "Heat 3", "Heat 4"].map((h) => (
          <span key={h} style={{ flex: 1, textAlign: "center", fontSize: 11, padding: "5px 0", borderRadius: 7, background: "rgba(255,255,255,0.05)", color: "#aeb4c7" }}>{h}</span>
        ))}
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12, color: "#aeb4c7" }}>Win a heat, you are locked into the A. Blow it and you are still racing.</p>
    </div>
  );
}

/* ── Season: a title race with two events left ──────────────────────── */
const TABLE = [
  { pos: 1, who: "novastreams", pts: 218 },
  { pos: 2, who: "kartqueen", pts: 204 },
  { pos: 3, who: "shellshock_sean", pts: 191 },
  { pos: 4, who: "crew_cass", pts: 177, dim: true },
];

export function SeasonShot() {
  return (
    <div className="pro-shot" aria-hidden="true">
      <p style={label}>Season standings · after event 6 of 10</p>
      <div>
        {TABLE.map((r) => (
          <div key={r.who} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", opacity: r.dim ? 0.55 : 1 }}>
            <span style={{ width: 18, fontWeight: 800, color: "#fabe23", fontVariantNumeric: "tabular-nums" }}>{r.pos}</span>
            <span style={{ flex: 1, color: "#f3f4f6", fontSize: 14 }}>{r.who}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "#f3f4f6" }}>{r.pts}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 12, color: "#aeb4c7" }}>Drop-worst applied · best 8 of 10 count · four can still win it</p>
    </div>
  );
}

/* ── The reveal landing in three places at once ─────────────────────── */
const SURFACES: { kind: string; head: string; sub: string; accent: string }[] = [
  { kind: "OBS overlay", head: "Race 7 of 12", sub: "Rainbow Road · Yoshi on the Teddy Buggy", accent: "#2766ec" },
  { kind: "Twitch chat", head: "GameShuffle", sub: "Race 7: Rainbow Road. Everyone on Yoshi. Good luck.", accent: "#c949e9" },
  { kind: "Public page", head: "Live", sub: "24 watching", accent: "#fabe23" },
];

export function RevealShot() {
  return (
    <div className="pro-shot" aria-hidden="true">
      <p style={label}>One draw, three screens</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SURFACES.map((s) => (
          <div key={s.kind} style={{ padding: "9px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", borderLeft: `3px solid ${s.accent}` }}>
            <span style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#aeb4c7" }}>{s.kind}</span>
            <span style={{ display: "block", color: "#f3f4f6", fontSize: 14, fontWeight: 600 }}>{s.head}</span>
            <span style={{ display: "block", fontSize: 12, color: "#aeb4c7" }}>{s.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
