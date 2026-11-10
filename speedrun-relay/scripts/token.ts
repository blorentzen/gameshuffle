// Prints a timer and overlay token for local testing, signed with SPEEDRUN_RELAY_SECRET from .dev.vars (or the env).
//   npx tsx scripts/token.ts <relayId> [timerVersion] [overlayVersion]
import { readFileSync } from "node:fs";
import { signToken } from "../src/tokens";

function secret(): string {
  if (process.env.SPEEDRUN_RELAY_SECRET) return process.env.SPEEDRUN_RELAY_SECRET;
  try {
    const m = /^SPEEDRUN_RELAY_SECRET\s*=\s*"?([^"\n]+)"?/m.exec(readFileSync(new URL("../.dev.vars", import.meta.url), "utf8"));
    if (m) return m[1].trim();
  } catch {
    // no .dev.vars
  }
  throw new Error("Set SPEEDRUN_RELAY_SECRET or add it to .dev.vars");
}

const [relayId, tv = "1", ov = tv] = process.argv.slice(2);
if (!relayId) {
  console.error("usage: npx tsx scripts/token.ts <relayId> [timerVersion] [overlayVersion]");
  process.exit(1);
}
const s = secret();
console.log(JSON.stringify({ timer: await signToken(s, "timer", relayId, Number(tv)), overlay: await signToken(s, "overlay", relayId, Number(ov)) }, null, 2));
