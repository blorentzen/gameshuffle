/**
 * GET /api/support/status → who's looking, for every Support ask (useSupportStatus):
 * { available, signedIn, supporter, since, name, pro, proElsewhere, level, founding, monthly, progress, supportersThisMonth }.
 * proElsewhere = GS Pro from a plan, trial or Circuit (a level with GS Pro would charge twice).
 * Support is for everyone, GS Pro members included (Britton's picks, 2026-10-19); a supporter
 * gets a thank-you instead of the ask, and outside the US the asks wait (US only for now).
 * A signed-in visitor's gifts made while signed out are claimed here first, by confirmed email.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { paidPlanAvailability } from "@/lib/billing/availability";
import { claimSupportGifts, monthProgress, supporterInfo, supportSettings } from "@/lib/support/store";
import { getProAccess } from "@/lib/subscription-server";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const available = paidPlanAvailability(req).available;
  // This month's goal and how many people gave (public numbers).
  const [settings, month] = await Promise.all([supportSettings().catch(() => null), monthProgress().catch(() => null)]);
  const progress = settings && settings.goalCents > 0 ? { goalCents: settings.goalCents, raisedCents: month?.raisedCents ?? 0 } : null;
  const supportersThisMonth = month?.supporters ?? 0;
  if (!user) return NextResponse.json({ available, signedIn: false, supporter: false, since: null, name: null, pro: false, proElsewhere: false, level: null, founding: null, monthly: null, progress, supportersThisMonth }, { headers: NO_STORE });
  if (user.email_confirmed_at) await claimSupportGifts(user.id, user.email).catch(() => 0);
  const admin = createServiceClient();
  const [info, access, row] = await Promise.all([
    supporterInfo(user.id).catch(() => null),
    getProAccess(user.id, admin).catch(() => null),
    admin.from("users").select("display_name, username").eq("id", user.id).maybeSingle().then((r) => r.data as { display_name: string | null; username: string | null } | null, () => null),
  ]);
  return NextResponse.json({
    available, signedIn: true,
    supporter: !!info?.supporter, since: info?.since ?? null,
    name: row?.display_name || row?.username || null,
    pro: !!access?.hasPro, proElsewhere: !!access?.sources.some((src) => src !== "support_level"),
    level: info?.level ?? null, founding: info?.founding ?? null,
    monthly: info?.monthly ?? null, progress, supportersThisMonth,
  }, { headers: NO_STORE });
}
