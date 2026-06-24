"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDownIcon, ExclamationIcon } from "@/components/icons";
import {
  MODULE_LABELS,
  PLATFORM_BADGE_STYLES,
  PLATFORM_LABELS,
  PRIORITY_BADGE_STYLES,
  PRIORITY_BORDER_COLORS,
  PRIORITY_LABELS,
  projectProgress,
  type Project,
} from "@/lib/dashboard/types";
import { relativeTime } from "@/lib/time";
import { Avatar } from "./Avatar";
import { ProgressBar } from "./ProgressBar";
import { ProjectActionsMenu } from "./ProjectActionsMenu";
import { DOT_STYLES, isAwaitingReview } from "./statusStyles";

const DAY_MS = 24 * 60 * 60 * 1000;

// deadline is a plain date ("2026-07-15", no time) — parsing it with a
// local-midnight suffix avoids the classic off-by-one-day bug where
// `new Date("2026-07-15")` parses as UTC midnight and shifts a day in
// timezones behind UTC.
function parseDeadline(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function formatDeadline(iso: string): string {
  return parseDeadline(iso)
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short" })
    .replace(/\.$/, "");
}

function deadlineUrgency(iso: string): "overdue" | "soon" | "normal" {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((parseDeadline(iso).getTime() - today.getTime()) / DAY_MS);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 3) return "soon";
  return "normal";
}

export function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const progress = projectProgress(project);
  const platformStyle = PLATFORM_BADGE_STYLES[project.platform];
  const priorityBadgeStyle = PRIORITY_BADGE_STYLES[project.priority];
  const priorityBorderColor = PRIORITY_BORDER_COLORS[project.priority];
  const urgency = project.deadline ? deadlineUrgency(project.deadline) : null;

  return (
    // Not a <Link> wrapping everything — ProjectActionsMenu needs a real
    // <button>, and nesting interactive elements inside an <a> is invalid
    // HTML. Instead: click-anywhere-to-navigate via this div's onClick, the
    // title itself is still a real <Link> (keyboard/screen-reader/
    // open-in-new-tab support), and the menu stops propagation so it never
    // triggers the card's own navigation.
    <div
      onClick={() => router.push(`/projects/${project.id}`)}
      style={
        priorityBorderColor
          ? { borderLeftWidth: "3px", borderLeftColor: priorityBorderColor }
          : undefined
      }
      className={`group relative cursor-pointer rounded-xl border border-gray-200 bg-background p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:hover:border-gray-700 ${
        priorityBorderColor ? "border-l-[3px]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={project.client.name} imageUrl={project.client.imageUrl} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">
              {project.client.name}
            </p>
            {project.channelUrl && (
              <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">
                {project.channelUrl}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {priorityBadgeStyle && (
            <span className={`text-[10px] font-medium uppercase tracking-wide ${priorityBadgeStyle}`}>
              {PRIORITY_LABELS[project.priority]}
            </span>
          )}
          <ProjectActionsMenu onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <Link
          href={`/projects/${project.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-base font-normal leading-snug text-foreground hover:underline"
        >
          {project.title}
        </Link>
        <span
          style={{ background: platformStyle.background, color: platformStyle.color }}
          className="flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
        >
          {PLATFORM_LABELS[project.platform]}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
        Criado {relativeTime(project.createdAt)} · Editado {relativeTime(project.updatedAt)}
      </p>

      {project.deadline && (
        <p
          className={`mt-1 flex items-center gap-1 text-xs ${
            urgency === "overdue"
              ? "text-red-600 dark:text-red-400"
              : urgency === "soon"
                ? "text-orange-600 dark:text-orange-400"
                : "text-gray-400 dark:text-gray-500"
          }`}
        >
          {urgency === "overdue" && <ExclamationIcon className="h-3.5 w-3.5" />}
          Prazo: {formatDeadline(project.deadline)}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <ProgressBar value={progress} />
        <span className="shrink-0 text-xs tabular-nums text-gray-400 dark:text-gray-500">
          {progress}%
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {project.modules.map((mod) => (
            <li
              key={mod.key}
              className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400"
              title={MODULE_LABELS[mod.key]}
            >
              <span className="relative flex h-2 w-2">
                {isAwaitingReview(mod.status) && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${DOT_STYLES[mod.status]}`}
                />
              </span>
              {MODULE_LABELS[mod.key]}
            </li>
          ))}
        </ul>
        <ChevronDownIcon className="h-4 w-4 shrink-0 -rotate-90 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5" />
      </div>
    </div>
  );
}
