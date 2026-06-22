/** Trust & Safety shared types. */

export type ModerationStatus = "ok" | "warned" | "suspended" | "banned";

export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";

export type ReportTargetType = "profile" | "user";

export interface Report {
  id: string;
  reporterUserId: string | null;
  targetType: ReportTargetType;
  targetId: string;
  reportedFields: string[];
  reason: string;
  details: string | null;
  status: ReportStatus;
  staffUserId: string | null;
  staffNotes: string | null;
  actionTaken: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
