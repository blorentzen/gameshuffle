import type { IdeaStatus } from "./constants";

/** Human labels for the lifecycle status (shared by the board + mine + detail). */
export const STATUS_LABEL: Record<IdeaStatus, string> = {
  submitted: "Pending review",
  rejected: "Not accepted",
  public: "Live",
  expired: "Expired",
  in_review: "In review",
  planned: "Planned",
  shipped: "Shipped",
  declined: "Declined",
};

export type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "outline";

/** Map a lifecycle status to a CDS Badge variant. */
export function statusBadgeVariant(status: IdeaStatus): BadgeVariant {
  switch (status) {
    case "shipped":
      return "success";
    case "planned":
      return "warning";
    case "declined":
    case "rejected":
      return "error";
    case "in_review":
    case "public":
      return "info";
    default:
      return "default"; // submitted, expired
  }
}
