import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isStaffRequest } from "@/lib/auth/raw";
import { ULTIMATE, fighterColor } from "@/data/smash/ultimate";
import type { ChatRoll, RollSlot } from "@/lib/twitch/chatRoll";
import { OverlayShowcase, type ShowcasePiece } from "@/components/social/OverlayShowcase";
import "../../../styles/overlay-showcase.css";

/**
 * /social/overlays: our real OBS overlay pieces on a 1280×720 "stream" with
 * sample data, for screenshots in the Twitch chat games guide. Nothing is
 * read from or written to the database; every sample lives in
 * OverlayShowcase. Shoot it at 1280×720 (the stage sits at the top left).
 *
 * Staff only in production; open on the dev server. Never in the sitemap or search.
 *   ?piece=<id>   one piece (ids below); without it, a list of links
 */

export const metadata: Metadata = {
  title: "Overlay showcase",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const PIECES: { id: ShowcasePiece; label: string }[] = [
  { id: "chat_brain", label: "Chat Brain: chat plays, mid-board" },
  { id: "trivia", label: "Trivia: multiple choice, question open" },
  { id: "number_bingo", label: "Stream Bingo: mid-game" },
  { id: "poll", label: "Poll" },
  { id: "whosaid", label: "Who Said It?" },
  { id: "draft", label: "Chat Draft: Pokémon Scarlet and Violet" },
  { id: "break_screen", label: "Break mode: Higher or Lower" },
  { id: "break_boss", label: "Break mode: Boss Fight" },
  { id: "wheel", label: "Wheel: landed" },
  { id: "battle", label: "Viewer battle: Smash Ultimate" },
  { id: "chaos", label: "Event banner: active modifier and open challenge" },
  { id: "picks_bans", label: "Picks & bans open banner" },
];

/** A viewer battle the way !gs-battle stores it: one fighter per player, the player's name as the detail line. */
function battleRoll(): ChatRoll {
  const lineup: [string, string][] = [
    ["Kirby", "kartkev"],
    ["Pikachu", "PogPriya"],
    ["Inkling", "LurkerLou"],
    ["Donkey Kong", "novastreams"],
    ["Link", "CozyCait"],
    ["Samus", "TurboTess"],
    ["Villager", "SnackSam"],
    ["Yoshi", "RiverRolls"],
  ];
  const slots: RollSlot[] = lineup.flatMap(([fighter, player]) => {
    const f = ULTIMATE.fighters.find((x) => x.name === fighter);
    if (!f) return [];
    return [{ label: "Fighter", name: f.name, kind: "portrait", img: `${ULTIMATE.assetBase}${f.img}`, color: fighterColor(f.series), detail: player }];
  });
  return {
    v: 2,
    kind: "battle",
    game: ULTIMATE.slug,
    title: "Viewer battle on Smashville",
    slots,
    text: slots.map((s) => `${s.detail}: ${s.name}`).join(" · "),
  };
}

export default async function SocialOverlaysPage({ searchParams }: { searchParams: Promise<{ piece?: string }> }) {
  if (process.env.NODE_ENV === "production" && !(await isStaffRequest())) notFound();
  const sp = await searchParams;
  const piece = PIECES.find((p) => p.id === sp.piece)?.id ?? null;

  if (!piece) {
    return (
      <main className="overlay-showcase">
        <div className="overlay-showcase__index">
          <h1>Overlay pieces</h1>
          <p>Our real OBS overlay pieces with sample data, on a 1280×720 stage. Screenshot each at 1280×720.</p>
          <ul>
            {PIECES.map((p) => (
              <li key={p.id}>
                <Link href={`/social/overlays?piece=${p.id}`}>
                  {p.label} <code>{p.id}</code>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    );
  }

  return <OverlayShowcase piece={piece} battle={piece === "battle" ? battleRoll() : null} />;
}
