/**
 * Community membership API.
 *   GET    — the caller's membership status + member count (auth optional)
 *   POST   — join the community (auth required; fires the join_community grant)
 *   DELETE — leave the community (auth required)
 *
 * `[id]` is the gs_communities id.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  joinCommunity,
  leaveCommunity,
  isMember,
  getMemberCount,
  getCommunityById,
} from "@/lib/communities/membership";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const community = await getCommunityById(id);
  if (!community) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const userId = await currentUserId();
  const [member, count] = await Promise.all([
    userId ? isMember(userId, id) : Promise.resolve(false),
    getMemberCount(id),
  ]);
  return NextResponse.json({ ok: true, isMember: member, memberCount: count });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const community = await getCommunityById(id);
  if (!community) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const result = await joinCommunity(userId, id);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.reason ?? "join_failed" }, { status: 400 });
  return NextResponse.json({ ok: true, alreadyMember: result.alreadyMember, memberCount: await getMemberCount(id) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  await leaveCommunity(userId, id);
  return NextResponse.json({ ok: true, memberCount: await getMemberCount(id) });
}
