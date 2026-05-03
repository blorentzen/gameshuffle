/**
 * Per-game command catalog renderer for the Hub Modules tab. Streamer
 * sees exactly which `!gs-*` chat commands work in the currently-
 * selected game's surface (and which ones have caveats — e.g. MKWorld
 * item modes not catalogued yet).
 *
 * Source of truth: `src/lib/twitch/commands/catalog.ts`. Add a new
 * command there + this surface picks it up automatically.
 */

import { Card } from "@empac/cascadeds";
import {
  getCommandsForGame,
  type CommandSpec,
  type CommandCategory,
} from "@/lib/twitch/commands/catalog";

interface Props {
  /** Game slug — `mario-kart-8-deluxe`, `mario-kart-world`, or
   *  `gs_default` for the queue surface. */
  gameSlug: string;
}

const CATEGORY_LABEL: Record<CommandCategory, string> = {
  viewer: "Viewers",
  broadcaster: "Broadcaster only",
  mod: "Mods + broadcaster",
};

export function CommandList({ gameSlug }: Props) {
  const grouped = getCommandsForGame(gameSlug);

  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Chat commands</h2>
      <Card variant="outlined" padding="medium">
        <p className="hub-detail__panel-text">
          Commands available when this game is the active category. Drop
          a <code>!</code> in chat to run them.
        </p>
        <div className="command-list">
          {(["viewer", "broadcaster", "mod"] as CommandCategory[]).map(
            (cat) => {
              const cmds = grouped[cat];
              if (cmds.length === 0) return null;
              return (
                <div key={cat} className="command-list__group">
                  <h3 className="command-list__group-title">
                    {CATEGORY_LABEL[cat]}
                  </h3>
                  <ul className="command-list__items">
                    {cmds.map((cmd) => (
                      <CommandRow key={cmd.name} cmd={cmd} gameSlug={gameSlug} />
                    ))}
                  </ul>
                </div>
              );
            }
          )}
        </div>
      </Card>
    </section>
  );
}

function CommandRow({
  cmd,
  gameSlug,
}: {
  cmd: CommandSpec;
  gameSlug: string;
}) {
  const caveat = cmd.caveatBySlug?.[gameSlug] ?? null;
  return (
    <li className={`command-list__row${caveat ? " command-list__row--caveat" : ""}`}>
      <code className="command-list__name">
        {cmd.name}
        {cmd.args && (
          <span className="command-list__args"> {cmd.args}</span>
        )}
      </code>
      <span className="command-list__desc">{cmd.description}</span>
      {caveat && <span className="command-list__caveat">⚠ {caveat}</span>}
    </li>
  );
}
