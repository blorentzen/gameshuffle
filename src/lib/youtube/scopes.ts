/**
 * Google OAuth scopes for the YouTube streamer integration.
 *
 * - youtube.readonly    — read the channel + active live broadcast / liveChatId
 * - youtube.force-ssl   — required to READ and INSERT live chat messages
 *                         (liveChatMessages.list / .insert)
 *
 * `youtube.force-ssl` is the broad read/write scope that covers posting chat as
 * the connected channel. We deliberately do NOT request account-management or
 * upload scopes — the integration only reads broadcast state and talks in chat.
 *
 * Google requires `access_type=offline` + `prompt=consent` on the authorize
 * request to receive a refresh token (see client.ts buildAuthorizeUrl).
 */

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
] as const;

export const YOUTUBE_SCOPE_STRING = YOUTUBE_SCOPES.join(" ");
