import type { ApprovalStatus } from "@/lib/dashboard/types";
import { STATUS_LABELS } from "@/lib/dashboard/types";
import { BADGE_STYLES, isAwaitingReview } from "./statusStyles";

export function StatusBadge({ status }: { status: ApprovalStatus }) {
  const awaiting = isAwaitingReview(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[status]}`}
    >
      {awaiting && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
        </span>
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}
