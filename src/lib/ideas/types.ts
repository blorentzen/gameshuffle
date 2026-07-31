import type { IdeaCategory, IdeaStatus } from "./constants";

/** Author attribution shown on every idea card (§5.5). */
export interface IdeaAuthor {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
}

/**
 * Public/author-facing idea shape. Deliberately OMITS internal columns
 * (`moderation_note`, `reviewed_by`, `reviewed_at`) — they must never reach a
 * client (§7), so they aren't in the type the store returns.
 */
export interface Idea {
  id: string;
  title: string;
  body: string;
  category: IdeaCategory;
  status: IdeaStatus;
  voteCount: number;
  submittedAt: string;
  publishedAt: string | null;
  expiresAt: string | null;
  cycleId: string | null;
  verdict: "planned" | "declined" | null;
  verdictNote: string | null;
  shippedRef: string | null;
  author: IdeaAuthor | null;
  /** Viewer-relative — set when a signed-in viewer is resolved. */
  hasVoted?: boolean;
  /** Reject reason, exposed to the AUTHOR only (§4). Never in public reads. */
  moderationNote?: string | null;
}

export interface IdeaCycle {
  id: string;
  name: string;
  opensAt: string | null;
  closesAt: string | null;
  status: "upcoming" | "voting" | "in_review" | "closed";
  slots: number;
}

export type IdeaSort = "top" | "new";
