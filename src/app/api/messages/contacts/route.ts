/** GET /api/messages/contacts → { contacts } — people the user can DM. */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMessageableContacts } from "@/lib/social/messaging";
import { MESSAGING_ON } from "@/lib/social/messagingOn";

export const runtime = "nodejs";

export async function GET() {
  if (!MESSAGING_ON) return NextResponse.json({ error: "messaging_off" }, { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const contacts = await listMessageableContacts(user.id);
  return NextResponse.json({ ok: true, contacts });
}
