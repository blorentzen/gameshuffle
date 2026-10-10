/**
 * Backup passwords are recommended, not a wall (Britton, 2026-10-10).
 * Every account should have one in case Twitch or Discord sign-in stops
 * working, but someone who signed up with Twitch or Discord can choose
 * "Not now": this cookie remembers that for 30 days, during which the
 * middleware stops sending them to /signup/set-password. Staff and admins
 * can't skip (the "Not now" route refuses them). Client- and edge-safe.
 */

export const PASSWORD_LATER_COOKIE = "gs-pw-later";
export const PASSWORD_LATER_DAYS = 30;
