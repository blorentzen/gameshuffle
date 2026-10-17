/** Referral links for the dailies: shared, client-safe types (server: src/lib/referrals/store.ts). */

/** Six letters and digits, no 0/O or 1/I. */
export const REFERRAL_CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export type ReferralGame = "shuffle" | "dex" | "weekly";

export interface ReferralLevers {
  /** Tokens for each new player who finishes from your link. */
  finish: number;
  /** More when that player makes an account. */
  signup: number;
  /** The new account's extra, on top of its welcome grant. */
  welcome: number;
  /** Paid players a day per account. */
  perDay: number;
  /** New players a day from one network. */
  perNetwork: number;
  /** How long a friend's browser remembers the link. */
  linkDays: number;
}

export interface ReferralRow { who: string; what: "finish" | "signup"; game: ReferralGame | null; at: string; tokens: number }

export interface ReferralView {
  /** False before the database is updated. */
  ready: boolean;
  code: string | null;
  levers: ReferralLevers;
  played: number;
  accounts: number;
  tokens: number;
  rows: ReferralRow[];
}

/** What the dailies' pages know about referrals for this visitor (from /api/dailies). */
export interface ReferralInfo { code: string | null; levers: ReferralLevers }
