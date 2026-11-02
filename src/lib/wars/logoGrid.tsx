/**
 * /logo list as a picture: a page of a server's team logos (up to 24, six across) with each tag under it, in the
 * competitive app's black and ice. Drawn at twice the size; tags have fixed boxes so long ones end in "…".
 */

import "server-only";
import { ImageResponse } from "next/og";
import { fonts } from "@/lib/og/eventCard";
import { logoPng } from "./card";
import { tagColor } from "./look";
import type { WarLogo } from "./logos";

const S = 2;
const u = (n: number) => n * S;
const W = 560;
const PAD = 16;
const COLS = 6;
const CELL = (W - PAD * 2) / COLS;
export const LOGOS_PER_PAGE = 24;

const clip = (s: string, n: number) => ([...s].length > n ? `${[...s].slice(0, n - 1).join("")}…` : s);

export async function renderLogoGrid(input: { server: string | null; logos: WarLogo[]; page: number; total: number; range: string }): Promise<Buffer> {
  const pngs = await Promise.all(input.logos.map((l) => logoPng(l.url, u(56))));
  const rows = Math.max(1, Math.ceil(input.logos.length / COLS));
  const h = PAD + 22 + 12 + rows * 92 + PAD;
  const [gabarito, outfit500, outfit600] = await fonts();
  const el = (
    <div style={{ width: u(W), height: u(h), display: "flex", flexDirection: "column", padding: u(PAD), background: "#05070b", color: "#eef4f8", fontFamily: "Outfit" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: u(22) }}>
        <div style={{ display: "flex", fontSize: u(15), fontWeight: 600, maxWidth: u(330), overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{clip(`Team logos in ${input.server || "this server"}`, 44)}</div>
        <div style={{ display: "flex", fontSize: u(13), color: "#a3b6c6" }}>{`${input.range} · ${input.logos.length} of ${input.total}`}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", marginTop: u(12), width: u(W - PAD * 2) }}>
        {input.logos.map((l, i) => (
          <div key={l.id} style={{ width: u(CELL), height: u(92), display: "flex", flexDirection: "column", alignItems: "center" }}>
            {pngs[i] ? (
              // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse
              <img src={pngs[i]!} width={u(56)} height={u(56)} alt="" />
            ) : (
              <div style={{ width: u(56), height: u(56), borderRadius: u(56), background: tagColor(l.tag), display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Gabarito", fontSize: u(14) }}>{clip(l.tag, 4)}</div>
            )}
            <div style={{ display: "flex", justifyContent: "center", width: u(CELL - 6), marginTop: u(8), fontSize: u(13), fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{clip(l.tag, 12)}</div>
          </div>
        ))}
      </div>
    </div>
  );
  const res = new ImageResponse(el, {
    width: u(W),
    height: u(h),
    fonts: [
      { name: "Gabarito", data: gabarito, weight: 700, style: "normal" },
      { name: "Outfit", data: outfit500, weight: 500, style: "normal" },
      { name: "Outfit", data: outfit600, weight: 600, style: "normal" },
    ],
  });
  return Buffer.from(await res.arrayBuffer());
}
