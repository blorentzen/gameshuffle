/**
 * A war table drawn (war tools pick 4A): the teams' logos, every player with their flag code, score and place, each
 * team's total and the gap, on the uploaded background behind a dark veil (or the competitive app's black with its
 * checkered corner). Drawn at twice the size; names have fixed boxes and end in "…".
 */

import "server-only";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { fonts, svgUri } from "@/lib/og/eventCard";
import { logoPng } from "./card";
import { flagPng } from "./flags";
import { tagColor } from "./look";
import { placesOf, teamTotal, type TableModel } from "./table";

const S = 2;
const u = (n: number) => n * S;
const W = 600;
const PAD = 16;
const ROW = 26;
const ICE = "#8cc8f0";

const clip = (s: string, n: number) => ([...s.trim()].length > n ? `${[...s.trim()].slice(0, n - 1).join("")}…` : s.trim());
const placeName = (p: number) => `${p}${p % 10 === 1 && p !== 11 ? "st" : p % 10 === 2 && p !== 12 ? "nd" : p % 10 === 3 && p !== 13 ? "rd" : "th"}`;

const ALLOWED = new Set(["gs-ugc.empac.co", "cdn.empac.co"]);
async function backgroundPng(url: string | null, w: number, h: number): Promise<string | null> {
  if (!url) return null;
  try { if (!ALLOWED.has(new URL(url).host)) return null; } catch { return null; }
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) }).catch(() => null);
  if (!res?.ok) return null;
  const jpg = await sharp(Buffer.from(await res.arrayBuffer())).resize(u(w), u(h), { fit: "cover" }).jpeg({ quality: 82 }).toBuffer().catch(() => null);
  return jpg ? `data:image/jpeg;base64,${jpg.toString("base64")}` : null;
}

function checker(w: number, h: number): string {
  const sq = u(10);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${u(w)}" height="${u(h)}"><defs><pattern id="p" width="${sq * 2}" height="${sq * 2}" patternUnits="userSpaceOnUse"><rect width="${sq}" height="${sq}" fill="${ICE}"/><rect x="${sq}" y="${sq}" width="${sq}" height="${sq}" fill="${ICE}"/></pattern><radialGradient id="g" cx="1" cy="0" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="m"><rect width="100%" height="100%" fill="url(#g)"/></mask></defs><rect width="100%" height="100%" fill="url(#p)" mask="url(#m)"/></svg>`;
}

export interface TablePicture { png: Buffer; alt: string }

/** `flags`: each flag code's picture (the server's own or the country flag, src/lib/wars/flags.ts); others draw as text. */
export async function renderTable(model: TableModel, opts: { logos: Record<string, string | null>; flags?: Record<string, string>; background: string | null; races: number | null }): Promise<TablePicture> {
  const teams = model.teams.filter((t) => t.players.length);
  const places = placesOf(model);
  const totals = teams.map(teamTotal);
  const best = Math.max(...totals);
  const second = [...totals].sort((a, b) => b - a)[1] ?? best;
  const blockH = (n: number) => Math.max(n, 2) * ROW + 12;
  const h = PAD + 28 + 10 + teams.reduce((a, t) => a + blockH(t.players.length) + 10, 0) + 18 + PAD;
  const [bg, ...logoPngs] = await Promise.all([backgroundPng(opts.background, W, h), ...teams.map((t) => logoPng(opts.logos[t.tag.toLowerCase()] ?? null, u(60)))]);
  const codes = [...new Set(teams.flatMap((t) => t.players.map((p) => p.flag).filter((f): f is string => !!f && !!opts.flags?.[f])))];
  const flagPics = new Map((await Promise.all(codes.map(async (c) => [c, await flagPng(opts.flags![c], u(24))] as const))).filter(([, v]) => !!v) as [string, string][]);
  const vs = teams.map((t) => t.name || t.tag).join(" vs ");
  const day = model.date && /^\d{4}-\d{2}-\d{2}/.test(model.date) ? new Date(`${model.date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : model.date;
  const head = [day, opts.races ? `${opts.races} races` : null].filter(Boolean).join(" · ") || "War table";

  const rowsW = W - PAD * 2 - 64 - 12 - 96 - 12;
  const block = (i: number): ReactElement => {
    const t = teams[i];
    const total = totals[i];
    const lead = total === best && best !== second ? total - second : null;
    return (
      <div key={i} style={{ display: "flex", alignItems: "center", marginTop: u(10), height: u(blockH(t.players.length)) }}>
        <div style={{ display: "flex", width: u(64), justifyContent: "center" }}>
          {logoPngs[i] ? (
            // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
            <img src={logoPngs[i]!} width={u(60)} height={u(60)} alt="" />
          ) : (
            <div style={{ width: u(56), height: u(56), borderRadius: u(56), background: tagColor(t.tag), border: `${u(3)}px solid rgba(255,255,255,0.85)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Gabarito", fontSize: u(t.tag.length > 3 ? 12 : 15), color: "#fff" }}>{clip(t.tag, 5)}</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", width: u(rowsW), marginLeft: u(12) }}>
          {t.players.map((p, j) => (
            <div key={j} style={{ display: "flex", alignItems: "center", height: u(ROW - 3), marginTop: j ? u(3) : 0, padding: `0 ${u(8)}px`, borderRadius: u(5), background: "rgba(6,9,14,0.84)" }}>
              <div style={{ display: "flex", width: u(rowsW - 16 - 34 - 44 - 40), fontSize: u(13), fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{clip(p.name, 22)}</div>
              <div style={{ display: "flex", width: u(34), justifyContent: "center" }}>
                {p.flag && flagPics.has(p.flag) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
                  <img src={flagPics.get(p.flag)!} width={u(24)} height={u(18)} alt="" />
                ) : p.flag ? <div style={{ display: "flex", fontSize: u(11), fontWeight: 600, padding: `${u(1)}px ${u(3)}px`, borderRadius: u(3), background: "#e8edf3", color: "#0b0e13" }}>{p.flag.toUpperCase().slice(0, 6)}</div> : null}
              </div>
              <div style={{ display: "flex", width: u(44), justifyContent: "flex-end", fontSize: u(13), fontWeight: 600 }}>{String(p.score)}</div>
              <div style={{ display: "flex", width: u(40), justifyContent: "flex-end", fontSize: u(12), color: "#c9d6e1" }}>{placeName(places.get(p) ?? 0)}</div>
            </div>
          ))}
          {t.penalty ? <div style={{ display: "flex", fontSize: u(12), color: "#ffb3b5", marginTop: u(3), paddingLeft: u(8) }}>{`Penalty -${t.penalty}`}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: u(96), marginLeft: u(12) }}>
          <div style={{ display: "flex", fontFamily: "Gabarito", fontSize: u(36), color: "#fff" }}>{String(total)}</div>
          {lead != null ? <div style={{ display: "flex", fontSize: u(14), fontWeight: 600, color: "#57d49a" }}>{`+${lead}`}</div> : null}
        </div>
      </div>
    );
  };

  const el = (
    <div style={{ width: u(W), height: u(h), display: "flex", position: "relative", background: "#05070b", color: "#eef4f8", fontFamily: "Outfit" }}>
      {bg ? (
        // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
        <img src={bg} width={u(W)} height={u(h)} style={{ position: "absolute", left: 0, top: 0 }} alt="" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
        <img src={svgUri(checker(W, h))} width={u(W)} height={u(h)} style={{ position: "absolute", left: 0, top: 0 }} alt="" />
      )}
      <div style={{ position: "absolute", left: 0, top: 0, width: u(W), height: u(h), display: "flex", background: bg ? "linear-gradient(rgba(4,6,10,0.45), rgba(4,6,10,0.62))" : "transparent" }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", padding: u(PAD), width: u(W), height: u(h) }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: u(28), padding: `0 ${u(10)}px`, borderRadius: u(6), background: "rgba(0,0,0,0.6)", fontFamily: "Gabarito", fontSize: u(14) }}>
          <div style={{ display: "flex", maxWidth: u(230), overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{clip(head, 32)}</div>
          <div style={{ display: "flex", maxWidth: u(300), overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{clip(model.title || vs, 44)}</div>
        </div>
        {teams.map((_, i) => block(i))}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: u(10), fontSize: u(12), color: "#dfe8f0" }}>gameshuffle.co</div>
      </div>
    </div>
  );
  const [gabarito, outfit500, outfit600] = await fonts();
  const res = new ImageResponse(el, {
    width: u(W),
    height: u(h),
    fonts: [
      { name: "Gabarito", data: gabarito, weight: 700, style: "normal" },
      { name: "Outfit", data: outfit500, weight: 500, style: "normal" },
      { name: "Outfit", data: outfit600, weight: 600, style: "normal" },
    ],
  });
  const alt = `${model.title || vs}: ${teams.map((t, i) => `${t.name || t.tag} ${totals[i]} (${t.players.map((p) => `${p.name} ${p.score}`).join(", ")})`).join("; ")}.`;
  return { png: Buffer.from(await res.arrayBuffer()), alt: alt.slice(0, 1000) };
}
