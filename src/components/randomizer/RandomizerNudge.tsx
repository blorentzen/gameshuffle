import { Container } from "@empac/cascadeds";
import { PlansPanel, type PlanRow } from "@/components/marketing/PlansPanel";
import { NewHereLine } from "@/components/welcome/NewHereLine";

/**
 * "Take {game} further", right under every randomizer (Britton's picks,
 * 2026-10-19, https://claude.ai/artifact/QaSjiFxbYHkNBAQq53xvpq): a free
 * account, GS Pro (this game on your stream) and GS Circuit (a tournament with
 * random picks), as one PlansPanel. It used to be a dark band at the very
 * bottom of the page, thousands of pixels below the tool. Render it between
 * the randomizer and its RandomizerLanding. Server component.
 */
export function RandomizerNudge({
  gameName,
  saves = "your kart builds and game-night setups",
  streamReady = true,
  tournament = true,
}: {
  gameName: string;
  /** What a free account saves, in this randomizer's terms. */
  saves?: string;
  /** This game runs on the Pro overlay and chat. False leaves out the GS Pro row. */
  streamReady?: boolean;
  /** Tournaments fit this game. False leaves out the GS Circuit row (a solo run challenge). */
  tournament?: boolean;
}) {
  const rows: PlanRow[] = ["account", ...(streamReady ? (["pro"] as const) : []), ...(tournament ? (["circuit"] as const) : [])];
  return (
    <Container>
      <NewHereLine from="randomizer" />
      <PlansPanel
        id="take-it-further"
        title={`Take ${gameName} further`}
        rows={rows}
        from="randomizer-nudge"
        copy={{
          account: { name: "Save your setups", body: `A free account saves ${saves} and keeps your group's scores across game nights.` },
          pro: { name: `Put ${gameName} on your stream`, body: "Chat rolls along with !gs-shuffle and !gs setup, viewers join your lobby, and every roll shows on your OBS overlay." },
          circuit: { name: `Run a ${gameName} tournament`, body: "Brackets, Swiss or points, with random picks each round. GS Circuit adds fields of 64 or 256 and season standings." },
        }}
      />
    </Container>
  );
}
