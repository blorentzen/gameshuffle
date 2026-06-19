/**
 * GET /api/admin/default-commands  → list
 * PUT /api/admin/default-commands  → upsert (id present = update,
 *                                    absent = create)
 *
 * Manages the platform-wide library of default chat commands —
 * Nightbot/StreamElements-style triggers that every streamer gets
 * by default, with the option to disable per-community via the
 * override table.
 *
 * Engine wiring (chat dispatch fallback) lands in a follow-up; for
 * now this API powers the Platform Admin → Commands tab so the
 * catalog can be edited ahead of the integration.
 *
 * Staff/admin only. RLS on `gs_default_commands` is enabled with no
 * public policies, so the service role is the only way in.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/subscription";

export const runtime = "nodejs";

type Category = "info" | "fun" | "engagement" | "wholesome" | "game";
type Authority = "viewer" | "vip" | "mod" | "host";

const CATEGORIES: Category[] = [
  "info",
  "fun",
  "engagement",
  "wholesome",
  "game",
];
const AUTHORITIES: Authority[] = ["viewer", "vip", "mod", "host"];

interface CommandRow {
  id: string;
  trigger: string;
  aliases: string[];
  category: Category;
  response_template: string | null;
  handler: string | null;
  description: string;
  inspired_by: string | null;
  default_enabled: boolean;
  enabled: boolean;
  cooldown_seconds: number;
  min_authority: Authority;
  created_at: string;
  updated_at: string;
}

interface PutBody {
  id?: string;
  trigger?: string;
  aliases?: string[];
  category?: Category;
  response_template?: string | null;
  handler?: string | null;
  description?: string;
  inspired_by?: string | null;
  default_enabled?: boolean;
  enabled?: boolean;
  cooldown_seconds?: number;
  min_authority?: Authority;
}

async function requireStaff(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const admin = createServiceClient();
  const { data } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (data as { role: string | null } | null)?.role ?? null;
  if (!isStaffRole(role)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true };
}

export async function GET() {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_default_commands")
    .select(
      "id, trigger, aliases, category, response_template, handler, description, inspired_by, default_enabled, enabled, cooldown_seconds, min_authority, created_at, updated_at",
    )
    .order("category", { ascending: true })
    .order("trigger", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    commands: (data ?? []) as CommandRow[],
  });
}

export async function PUT(req: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as PutBody | null;
  if (!body) {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const trigger = (body.trigger ?? "").trim().toLowerCase();
  if (!trigger) {
    return NextResponse.json({ error: "trigger_required" }, { status: 400 });
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(trigger)) {
    return NextResponse.json(
      {
        error:
          "Trigger must contain only lowercase letters, digits, hyphens, and underscores (e.g. `8ball`, `gg`, `shoutout`).",
      },
      { status: 400 },
    );
  }
  const category = body.category ?? "info";
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }
  const minAuthority = body.min_authority ?? "viewer";
  if (!AUTHORITIES.includes(minAuthority)) {
    return NextResponse.json(
      { error: "invalid_min_authority" },
      { status: 400 },
    );
  }
  const description = (body.description ?? "").trim();
  if (!description) {
    return NextResponse.json(
      { error: "description_required" },
      { status: 400 },
    );
  }
  const handler =
    body.handler && body.handler.trim() ? body.handler.trim().toLowerCase() : null;
  if (handler && !/^[a-z][a-z0-9_]*$/.test(handler)) {
    return NextResponse.json(
      {
        error:
          "Handler must start with a lowercase letter and contain only lowercase letters, digits, and underscores.",
      },
      { status: 400 },
    );
  }
  const responseTemplate =
    body.response_template?.trim() ? body.response_template.trim() : null;
  // Mirror the DB check: at least one action must exist.
  if (!handler && !responseTemplate) {
    return NextResponse.json(
      {
        error:
          "Command needs either a response template or a handler (or both).",
      },
      { status: 400 },
    );
  }
  // Normalize alias list — drop blanks, lowercase, dedupe.
  const aliases = Array.from(
    new Set(
      (body.aliases ?? [])
        .map((a) => a.trim().toLowerCase())
        .filter((a) => a.length > 0 && /^[a-z0-9][a-z0-9_-]*$/.test(a)),
    ),
  );
  const cooldown_seconds = Math.max(
    0,
    Math.floor(body.cooldown_seconds ?? 30),
  );
  const default_enabled = body.default_enabled !== false;
  const enabled = body.enabled !== false;

  const payload = {
    trigger,
    aliases,
    category,
    response_template: responseTemplate,
    handler,
    description,
    inspired_by: body.inspired_by?.trim() || null,
    default_enabled,
    enabled,
    cooldown_seconds,
    min_authority: minAuthority,
  };

  const admin = createServiceClient();
  if (body.id) {
    const { error } = await admin
      .from("gs_default_commands")
      .update(payload)
      .eq("id", body.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: body.id });
  }
  const { data, error } = await admin
    .from("gs_default_commands")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
