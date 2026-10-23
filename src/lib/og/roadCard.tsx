import "server-only";

/**
 * Trainer Road's link previews (1200x630). A trainer's card puts their picture (official artwork or a
 * card's art window, cut with the Duel's crop rule) in its own panel on the right behind a hard gold
 * edge, never faded into the text (Britton, 2026-10-23), with "Duel Cynthia", their role and their
 * team in large type on the left. A region's card shows its Gym Leaders' faces; Trainer Road's own
 * card shows a Champion from each region.
 */

import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { fieldSvg, fonts, logo, OG_SIZE, svgUri } from "@/lib/og/eventCard";
import { trainerArtPng } from "@/lib/share/render";
import { personView, regionView } from "@/lib/originals/duel/roadPages";
import { ROAD_REGIONS } from "@/lib/originals/duel/road";
import type { DuelPicture } from "@/lib/originals/duel/view";

const { width: W, height: H } = OG_SIZE;
const PANEL = 520;
const EDGE = 8;
const GOLD = "#f5c84c";
const TEXT_W = W - PANEL - EDGE - 72 - 48;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The shared frame: navy ground and glyph field, the logo, a kicker, the title and what goes under it; `panel` fills the right side. */
async function frame(o: { title: string; sub?: string | null; foot: ReactNode; panel: ReactNode; panelBg?: string }): Promise<ImageResponse> {
  const [[gabarito, outfit500, outfit600], logoSrc] = await Promise.all([fonts(), logo()]);
  const len = o.title.length;
  const size = len <= 13 ? 96 : len <= 17 ? 80 : len <= 24 ? 68 : 58;
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", color: "#ffffff", fontFamily: "Outfit", background: "linear-gradient(135deg, #10123a 0%, #0b0d1c 60%, #0b0d14 100%)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not a browser */}
        <img src={svgUri(fieldSvg(["cards", "pokeball", "trophy"], W - PANEL, H))} width={W - PANEL} height={H} style={{ position: "absolute", top: 0, left: 0, opacity: 0.7 }} alt="" />
        <div style={{ position: "absolute", top: 0, left: 0, width: W - PANEL, height: H, display: "flex", background: "radial-gradient(circle at 0% 0%, rgba(168,122,23,0.35) 0%, rgba(11,13,28,0) 55%)" }} />

        <div style={{ position: "absolute", top: 0, right: 0, width: PANEL, height: H, display: "flex", background: o.panelBg ?? "#0b0d1c" }}>{o.panel}</div>
        <div style={{ position: "absolute", top: 0, right: PANEL, width: EDGE, height: H, display: "flex", background: GOLD }} />

        <div style={{ position: "absolute", left: 72, top: 60, bottom: 60, width: TEXT_W, display: "flex", flexDirection: "column" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
          <img src={logoSrc} width={205} height={28} alt="" />
          <div style={{ display: "flex", marginTop: 40, fontSize: 26, fontWeight: 600, letterSpacing: 3.2, color: GOLD }}>TRAINER ROAD</div>
          <div style={{ display: "flex", marginTop: 10, fontFamily: "Gabarito", fontSize: size, lineHeight: 1.0, letterSpacing: -1 }}>{o.title}</div>
          {o.sub && <div style={{ display: "flex", marginTop: 16, fontSize: 34, fontWeight: 600, color: "#dfe3ff" }}>{clip(o.sub, 34)}</div>}
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>{o.foot}</div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Gabarito", data: gabarito, weight: 700, style: "normal" },
        { name: "Outfit", data: outfit500, weight: 500, style: "normal" },
        { name: "Outfit", data: outfit600, weight: 600, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}

/** A small caps label over a line of large text. */
function Foot({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: 2.4, color: "#a9b8ff" }}>{label.toUpperCase()}</div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 32, fontWeight: 600, lineHeight: 1.25, color: "#ffffff" }}>{clip(text, 70)}</div>
    </div>
  );
}

/** Round faces in a grid, each its picture's face crop. */
async function faces(pictures: DuelPicture[], size: number, cols: number): Promise<ReactNode> {
  const srcs = (await Promise.all(pictures.map((p) => trainerArtPng(p, size * 2, size * 2, { zoom: Math.max(1, p.face[2]), py: 0.5 })))).filter((s): s is string => !!s);
  if (!srcs.length) return null;
  const gap = 18;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: cols * size + (cols - 1) * gap, margin: "auto", justifyContent: "center" }}>
      {srcs.map((src, i) => (
        <div key={i} style={{ display: "flex", width: size, height: size, marginRight: (i + 1) % cols ? gap : 0, marginBottom: gap, borderRadius: size, overflow: "hidden", border: `4px solid ${GOLD}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse */}
          <img src={src} width={size - 8} height={size - 8} style={{ borderRadius: size }} alt="" />
        </div>
      ))}
    </div>
  );
}

/** A trainer's preview: their picture behind a hard edge, and their first team written out. */
export async function roadTrainerCard(region: string, slug: string) {
  const v = personView(region, slug);
  if (!v) return roadHubCard();
  const art = v.picture ? await trainerArtPng(v.picture, PANEL, H, { py: 0.4 }) : null;
  const team = v.teams[0];
  const games = new Set(v.teams.map((t) => t.gameLabel)).size;
  return frame({
    title: `Duel ${v.person.name}`,
    sub: v.role,
    foot: team ? <Foot label={games > 1 ? `${team.gameLabel} team · ${games - 1} more ${games === 2 ? "game" : "games"}` : `${team.gameLabel} team`} text={team.species.join(", ")} /> : null,
    // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
    panel: art ? <img src={art} width={PANEL} height={H} alt="" /> : null,
    panelBg: v.picture?.kind === "official" ? "#ffffff" : "#0b0d1c",
  });
}

/** A region's preview: its Gym Leaders' faces. */
export async function roadRegionCard(region: string) {
  const v = regionView(region);
  if (!v) return roadHubCard();
  const gym = v.sections.find((s) => s.tier === "gym");
  const pics = (gym?.tiles ?? []).map((t) => t.picture).filter((p): p is DuelPicture => !!p).slice(0, 9);
  const label = gym ? (gym.label === "Gym Leaders" ? gym.label : gym.label.toLowerCase()) : "trainers";
  return frame({
    title: `Duel ${v.region.name}'s trainers`,
    sub: null,
    foot: <Foot label={`${v.people.length} trainers`} text={`${gym ? `${gym.tiles.length} ${label}, ` : ""}the Elite Four, Champions and more`} />,
    panel: await faces(pics, pics.length > 4 ? 128 : 170, pics.length > 4 ? 3 : 2),
  });
}

/** Trainer Road's own preview: a Champion from each region. */
export async function roadHubCard() {
  const pics: DuelPicture[] = [];
  for (const r of ROAD_REGIONS) {
    const v = regionView(r.slug);
    const champ = v?.sections.find((s) => s.tier === "champion")?.tiles[0]?.picture;
    if (champ) pics.push(champ);
  }
  return frame({
    title: "Duel every Pokémon trainer",
    sub: null,
    foot: <Foot label={`${ROAD_REGIONS.length} regions`} text="Gym Leaders, the Elite Four and Champions, from Kanto to Paldea" />,
    panel: await faces(pics.slice(0, 9), 128, 3),
  });
}
