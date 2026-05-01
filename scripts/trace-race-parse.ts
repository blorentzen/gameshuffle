import { parseCommand } from "../src/lib/twitch/commands/parse";
import { parseSeriesLength } from "../src/lib/randomizers/race/series";

for (const input of ["!gs-race 4", "!gs-race  4", "!gs-race 8", "!gs-race", "!gs-track 4", "!gs-track 6"]) {
  const c = parseCommand(input);
  if (!c) {
    console.log(`${JSON.stringify(input)} → null`);
    continue;
  }
  const n = parseSeriesLength(c.args);
  console.log(`${JSON.stringify(input)} → name=${JSON.stringify(c.name)} args=${JSON.stringify(c.args)} → series=${n}`);
}
