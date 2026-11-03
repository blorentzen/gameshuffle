import "server-only";

/**
 * Discord REST calls as GameShuffle Competitive's bot (its token, whichever app the request came in on), shared by
 * the time trial panel and the war card. `restFile` sends one picture with the message (multipart), for drawn cards.
 */

import { botTokenFor } from "./apps";

export type RestResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function finish<T>(res: Response | null): Promise<RestResult<T>> {
  if (!res) return { ok: false, status: 0, error: "network" };
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text().catch(() => "")).slice(0, 200) };
  return { ok: true, data: (res.status === 204 ? {} : await res.json().catch(() => ({}))) as T };
}

export async function compRest<T = unknown>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, body?: unknown): Promise<RestResult<T>> {
  const token = botTokenFor("comp");
  if (!token) return { ok: false, status: 0, error: "no_token" };
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  return finish<T>(res);
}

/** A message with one picture: `body` refers to it as attachment://<name>. */
export async function compRestFile<T = unknown>(method: "POST" | "PATCH", path: string, body: Record<string, unknown>, file: { name: string; data: Buffer; type?: string }): Promise<RestResult<T>> {
  const token = botTokenFor("comp");
  if (!token) return { ok: false, status: 0, error: "no_token" };
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ ...body, attachments: [{ id: 0, filename: file.name }] }));
  form.append("files[0]", new Blob([new Uint8Array(file.data)], { type: file.type ?? "image/png" }), file.name);
  const res = await fetch(`https://discord.com/api/v10${path}`, { method, headers: { Authorization: `Bot ${token}` }, body: form }).catch(() => null);
  return finish<T>(res);
}
