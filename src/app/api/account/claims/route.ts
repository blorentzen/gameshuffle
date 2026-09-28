import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptClaimOffers, listClaimOffers } from "@/lib/tournaments/claims";

export const runtime = "nodejs";

/**
 * Guest entries saved under the signed-in account's verified email (spec F).
 *
 *   GET                       The entries on offer.
 *   POST { claimIds: [...] }  Link the ones the account picked. Nothing links
 *                             without this explicit request.
 */
async function verifiedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "signed_out" }, { status: 401 }) };
  if (!user.email || !user.email_confirmed_at) return { error: NextResponse.json({ error: "email_unverified" }, { status: 403 }) };
  return { user: { id: user.id, email: user.email } };
}

export async function GET() {
  const v = await verifiedUser();
  if (v.error) return v.error;
  return NextResponse.json({ ok: true, offers: await listClaimOffers(v.user.id, v.user.email) });
}

export async function POST(req: NextRequest) {
  const v = await verifiedUser();
  if (v.error) return v.error;
  const body = (await req.json().catch(() => ({}))) as { claimIds?: unknown };
  const ids = Array.isArray(body.claimIds) ? body.claimIds.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  if (!ids.length) return NextResponse.json({ error: "nothing_selected" }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await acceptClaimOffers(v.user.id, v.user.email, ids)) });
}
