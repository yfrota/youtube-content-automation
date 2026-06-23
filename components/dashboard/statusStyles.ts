import type { ApprovalStatus } from "@/lib/mock/projects";

// "In review" states get a pulsing dot to signal they're waiting on a human.
export function isAwaitingReview(status: ApprovalStatus): boolean {
  return status === "kelly_review" || status === "client_review";
}

// Soft, desaturated pill styles — no loud colors, per the design spec.
export const BADGE_STYLES: Record<ApprovalStatus, string> = {
  draft:
    "bg-gray-100 text-gray-600 dark:bg-gray-800/70 dark:text-gray-400",
  kelly_review:
    "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
  client_review:
    "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300",
  approved:
    "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300",
  published: "bg-accent/10 text-accent dark:bg-accent/15",
};

// Dot color for the pipeline-stage indicators. Both "done" states
// (approved + published) read green, so a fully-published project shows all
// green dots; accent blue stays reserved for the progress bar and the
// "Publicado" badge in the detail view.
export const DOT_STYLES: Record<ApprovalStatus, string> = {
  draft: "bg-gray-300 dark:bg-gray-600",
  kelly_review: "bg-blue-400",
  client_review: "bg-blue-400",
  approved: "bg-green-500",
  published: "bg-green-500",
};
