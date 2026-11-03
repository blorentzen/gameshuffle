import { readWarSlug } from "@/lib/wars/page";
import { warByShort, warsReady } from "@/lib/wars/store";
import { siteLogos } from "@/lib/wars/logos";
import { renderWarCard } from "@/lib/wars/card";

/**
 * The war page's link preview: the war's own card (the picture its Discord channel shows), drawn on a 1200 × 630
 * frame. Logos only where GameShuffle's pages may show them (src/lib/wars/logos.ts siteLogos).
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Mario Kart war's score";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const short = readWarSlug((await params).slug);
  const war = short && (await warsReady()) ? await warByShort(short) : null;
  if (!war) return new Response("Not found", { status: 404 });
  const safe = await siteLogos([war.us.logo, war.them.logo]);
  const shown = { ...war, us: { ...war.us, logo: war.us.logo && safe.has(war.us.logo) ? war.us.logo : null }, them: { ...war.them, logo: war.them.logo && safe.has(war.them.logo) ? war.them.logo : null } };
  const { png } = await renderWarCard(shown, { frame: { w: size.width / 2, h: size.height / 2 } });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": `public, max-age=60, s-maxage=${war.status === "live" ? 30 : 600}` } });
}
