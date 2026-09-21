/**
 * Reusable YouTube integration teardown. Used by:
 *   - POST /api/youtube/disconnect (user-initiated)
 *   - the account-deletion cascade (/api/account/delete)
 *
 * Steps (best-effort at each — we'd rather orphan a revoked token than abandon
 * the row delete):
 *   1. Revoke the Google OAuth grant (via the refresh token, else the access token)
 *   2. Delete the youtube_connections row
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { decryptToken } from "./crypto";
import { revokeGoogleToken } from "./client";

export interface YouTubeDisconnectResult {
  alreadyDisconnected: boolean;
  revokedToken: boolean;
  deletedConnection: boolean;
}

export async function disconnectYouTubeIntegration(
  userId: string,
): Promise<YouTubeDisconnectResult> {
  const admin = createServiceClient();
  const { data: connection } = await admin
    .from("youtube_connections")
    .select("id, access_token_encrypted, refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();

  if (!connection) {
    return { alreadyDisconnected: true, revokedToken: false, deletedConnection: false };
  }

  const row = connection as {
    id: string;
    access_token_encrypted: string | null;
    refresh_token_encrypted: string | null;
  };

  let revokedToken = false;
  const encrypted = row.refresh_token_encrypted ?? row.access_token_encrypted;
  if (encrypted) {
    try {
      revokedToken = await revokeGoogleToken(decryptToken(encrypted));
    } catch {
      // decryption or revoke failed — continue to the row delete anyway.
    }
  }

  const { error } = await admin.from("youtube_connections").delete().eq("id", row.id);
  return {
    alreadyDisconnected: false,
    revokedToken,
    deletedConnection: !error,
  };
}
