// The Worker in front of the Durable Objects: checks tokens and the shared secret, then hands each request to the
// runner's object (one per relayId). Routes are listed in README.md and specs/gs-speedrun/phase1-contract.md.

import { CLOSE, Relay, refuse, type RelayEnv } from "./relay";
import { Room } from "./room";
import { bearerOk, RELAY_ID_RE, verifyToken } from "./tokens";

export { Relay, Room };

// /admin can carry the run's splits for remote mode (500 names at most); commands are tiny. A room's setup carries
// its checkpoints and up to 8 entrants.
const MAX_BODY = { cmd: 4096, admin: 131072, room: 131072 } as const;

function text(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", ...headers } });
}

/** Copies the request's headers without anything that looks like ours, then adds ours. */
function forwardHeaders(req: Request, extra: Record<string, string>): Headers {
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!key.toLowerCase().startsWith("x-relay-") && key.toLowerCase() !== "x-token-version") headers.set(key, value);
  });
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return headers;
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health") return text("ok", 200);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) return text("Not found", 404);
    const [route, arg] = parts;
    const secret = env.SPEEDRUN_RELAY_SECRET;
    if (!secret) return text("The relay isn't set up yet.", 503);

    if (route === "lso" || route === "watch") {
      if (req.method !== "GET") return text("Method not allowed", 405, { allow: "GET" });
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return text("This address is for a WebSocket connection.", 426, { upgrade: "websocket" });
      }
      let token = arg;
      try {
        token = decodeURIComponent(arg);
      } catch {
        // keep as is
      }
      const info = await verifyToken(secret, token, route === "lso" ? "timer" : "overlay");
      if (!info) return refuse(CLOSE.invalid.code, CLOSE.invalid.reason);
      const headers = forwardHeaders(req, {
        "x-relay-op": route,
        "x-relay-id": info.relayId,
        "x-token-version": String(info.version),
      });
      return env.RELAY.getByName(info.relayId).fetch(new Request(req.url, { method: "GET", headers }));
    }

    // A race room (src/room.ts): anyone with the room's signed watch address follows it; the site sets it up.
    if (route === "roomwatch") {
      if (req.method !== "GET") return text("Method not allowed", 405, { allow: "GET" });
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return text("This address is for a WebSocket connection.", 426, { upgrade: "websocket" });
      }
      let token = arg;
      try {
        token = decodeURIComponent(arg);
      } catch {
        // keep as is
      }
      const info = await verifyToken(secret, token, "room");
      if (!info) return refuse(CLOSE.invalid.code, CLOSE.invalid.reason);
      const headers = forwardHeaders(req, { "x-relay-op": "roomwatch", "x-room-id": info.relayId });
      return env.ROOM.getByName(info.relayId).fetch(new Request(req.url, { method: "GET", headers }));
    }

    if (route === "room") {
      if (req.method !== "GET" && req.method !== "POST") return text("Method not allowed", 405, { allow: "GET, POST" });
      if (!RELAY_ID_RE.test(arg)) return text("Not found", 404);
      if (!(await bearerOk(secret, req.headers.get("authorization")))) return text("Unauthorized", 401);
      let body: string | undefined;
      if (req.method === "POST") {
        body = await req.text();
        if (body.length > MAX_BODY.room) return text("Too large", 413);
      }
      const headers = new Headers({ "x-relay-op": "room", "x-room-id": arg, "content-type": "application/json" });
      return env.ROOM.getByName(arg).fetch(new Request("https://room/room", { method: req.method, headers, body }));
    }

    if (route === "cmd" || route === "admin" || route === "state") {
      const method = route === "state" ? "GET" : "POST";
      if (req.method !== method) return text("Method not allowed", 405, { allow: method });
      if (!RELAY_ID_RE.test(arg)) return text("Not found", 404);
      if (!(await bearerOk(secret, req.headers.get("authorization")))) return text("Unauthorized", 401);
      let body: string | undefined;
      if (method === "POST") {
        body = await req.text();
        if (body.length > MAX_BODY[route as "cmd" | "admin"]) return text("Too large", 413);
      }
      const headers = new Headers({ "x-relay-op": route, "x-relay-id": arg, "content-type": "application/json" });
      return env.RELAY.getByName(arg).fetch(new Request(`https://relay/${route}`, { method, headers, body }));
    }

    return text("Not found", 404);
  },
} satisfies ExportedHandler<RelayEnv>;
