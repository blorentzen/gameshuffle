/**
 * GET /api/support/status → who's looking, for every Support ask (useSupportStatus):
 * { available, signedIn, supporter, since, name, pro, proElsewhere, level, founding, monthly, progress, supportersThisMonth,
 *   looks, supporterLooks }. looks = may use looks (GS Pro, or support sold with them); supporterLooks = the
 *   $3 Supporter level sells looks right now (on unless the support_supporter_looks switch is off).
 * proElsewhere = GS Pro from a plan, trial or Circuit (a level with GS Pro would charge twice).
 * Support is for everyone, GS Pro members included (Britton's picks, 2026-10-19); a supporter
 * gets a thank-you instead of the ask. Outside the US the asks show while the support_international switch is on
 * (the default), else they wait.
 * A signed-in visitor's gifts made while signed out are claimed here first, by confirmed email.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { supportAvailability } from "@/lib/billing/availability";
import { claimSupportGifts, monthProgress, supporterInfo, supportSettings } from "@/lib/support/store";
import { getProAccess } from "@/lib/subscription-server";
import { hasLooks, supporterLooksOn } from "@/lib/support/looks";
import { personaPreview } from "@/lib/preview/server";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const available = (await supportAvailability(req)).available;
  // This month's goal and how many people gave (public numbers).
  const [settings, month, supporterLooks] = await Promise.all([supportSettings().catch(() => null), monthProgress().catch(() => null), supporterLooksOn()]);
  const progress = settings && settings.goalCents > 0 ? { goalCents: settings.goalCents, raisedCents: month?.raisedCents ?? 0 } : null;
  const supportersThisMonth = month?.supporters ?? 0;
  if (!user) return NextResponse.json({ available, signedIn: false, supporter: false, since: null, name: null, pro: false, proElsewhere: false, level: null, founding: null, monthly: null, progress, supportersThisMonth, looks: false, supporterLooks }, { headers: NO_STORE });
  if (user.email_confirmed_at) await claimSupportGifts(user.id, user.email).catch(() => 0);
  const admin = createServiceClient();
  const [info, access, row, looks] = await Promise.all([
    supporterInfo(user.id).catch(() => null),
    getProAccess(user.id, admin).catch(() => null),
    admin.from("users").select("display_name, username").eq("id", user.id).maybeSingle().then((r) => r.data as { display_name: string | null; username: string | null } | null, () => null),
    hasLooks(user.id).catch(() => false),
  ]);
  // A staff persona preview (src/lib/preview) answers as that plan: a Supporter since this month, or neither.
  const preview = await personaPreview();
  if (preview) {
    const supporter = preview.plan === "supporter";
    return NextResponse.json({
      available, signedIn: true, supporter, since: supporter ? new Date().toISOString() : null,
      name: row?.display_name || row?.username || null,
      pro: preview.plan === "pro", proElsewhere: preview.plan === "pro",
      level: supporter ? "supporter" : null, founding: null,
      monthly: supporter ? { amountCents: 300, status: "active", cancelAtPeriodEnd: false, renewsAt: null, level: "supporter" } : null,
      progress, supportersThisMonth, looks: preview.plan !== "free", supporterLooks,
    }, { headers: NO_STORE });
  }
  return NextResponse.json({
    available, signedIn: true,
    supporter: !!info?.supporter, since: info?.since ?? null,
    name: row?.display_name || row?.username || null,
    pro: !!access?.hasPro, proElsewhere: !!access?.sources.some((src) => src !== "support_level"),
    level: info?.level ?? null, founding: info?.founding ?? null,
    monthly: info?.monthly ?? null, progress, supportersThisMonth,
    looks, supporterLooks,
  }, { headers: NO_STORE });
}
