/** GET /api/admin/economy/dashboard → Token economy ▸ Streamers + History extras (staff only). */
import { NextResponse } from "next/server";
import { isStaffRequest } from "@/lib/auth/raw";
import { economyDashboard } from "@/lib/economy/policy/dashboard";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isStaffRequest())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await economyDashboard()) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("[admin/economy/dashboard]", err);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
