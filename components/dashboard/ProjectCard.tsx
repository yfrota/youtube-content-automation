"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import {
  ExclamationIcon,
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  PlayCircleIcon,
  SpotifyIcon,
  TiktokIcon,
} from "@/components/icons";
import {
  MODULE_LABELS,
  PLATFORM_BADGE_STYLES,
  PLATFORM_LABELS,
  PRIORITY_BORDER_COLORS,
  isModuleDone,
  projectProgress,
  type ModuleKey,
  type Platform,
  type Project,
} from "@/lib/dashboard/types";
import { relativeTime } from "@/lib/time";
import { Avatar } from "./Avatar";
import { ProjectActionsMenu } from "./ProjectActionsMenu";

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

// Same generic-outline-glyph precedent as the new-project form's platform
// picker (not brand wordmarks) — duplicated locally rather than importing
// that file's array since it's module-local there too.
const PLATFORM_ICONS: Record<Platform, ComponentType<SVGProps<SVGSVGElement>>> = {
  youtube: PlayCircleIcon,
  instagram: InstagramIcon,
  linkedin: LinkedinIcon,
  facebook: FacebookIcon,
  spotify: SpotifyIcon,
  tiktok: TiktokIcon,
};

// Abbreviated stage labels for the card's tiny (text-[9px]) stage row —
// MODULE_LABELS itself stays untouched (used elsewhere for full-word
// contexts: the detail page's stepper, this card's own title tooltip).
const STAGE_SHORT_LABELS: Record<ModuleKey, string> = {
  script: "Roteiro",
  seo: "SEO",
  thumbnail: "Thumb",
  checklist: "Check",
};

const STAGE_DOT_COLOR = {
  done: "#6ee7b7",
  active: "#c4b5fd",
  pending: "#e5ddd2",
} as const;

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
  const PlatformIcon = PLATFORM_ICONS[project.platform];
  const priorityBorderColor = PRIORITY_BORDER_COLORS[project.priority];
  const urgency = project.deadline ? deadlineUrgency(project.deadline) : null;

  // First not-yet-done module is "active" (purple) — every module before it
  // is "done" (green), every module after it is "pending" (beige). Draft
  // AND kelly_review/client_review both count as "not done" here, so a
  // module awaiting review still reads as the active stage, not pending.
  const firstIncompleteIndex = project.modules.findIndex((m) => !isModuleDone(m.status));

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
      className={`group relative cursor-pointer rounded-[16px] border border-halo-border bg-halo-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(196,181,253,0.15)] ${
        priorityBorderColor ? "border-l-[3px]" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={project.client.name} imageUrl={project.client.imageUrl} gradient />
          <p className="truncate text-xs font-medium text-halo-text-muted">
            {project.client.name}
          </p>
        </div>
        <ProjectActionsMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      <Link
        href={`/projects/${project.id}`}
        onClick={(e) => e.stopPropagation()}
        className="mt-3 block text-base font-normal leading-snug text-halo-text hover:underline"
      >
        {project.title}
      </Link>

      <p className="mt-1.5 text-xs text-halo-text-muted">Editado {relativeTime(project.updatedAt)}</p>

      {/* Priority/deadline mechanics unchanged — only the border-left color
          and this warning line stay; the priority text badge that used to
          sit next to the menu icon is dropped (not in the new card layout). */}
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
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-[#f5f1ea]">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, background: "linear-gradient(90deg, #c4b5fd, #f9a8d4)" }}
          />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-halo-text-muted">{progress}%</span>
      </div>

      <ul className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {project.modules.map((mod, i) => {
          const state = isModuleDone(mod.status)
            ? "done"
            : i === firstIncompleteIndex
              ? "active"
              : "pending";
          return (
            <li
              key={mod.key}
              className="flex items-center gap-1 text-[9px] font-medium text-halo-text-muted"
              title={MODULE_LABELS[mod.key]}
            >
              <span
                className="h-[6px] w-[6px] shrink-0 rounded-full"
                style={{ backgroundColor: STAGE_DOT_COLOR[state] }}
              />
              {STAGE_SHORT_LABELS[mod.key]}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex justify-center">
        <span
          className="inline-flex items-center gap-1.5 rounded-[8px] px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-white"
          style={{ background: platformStyle.background }}
        >
          <PlatformIcon className="h-3 w-3" />
          {PLATFORM_LABELS[project.platform]}
        </span>
      </div>
    </div>
  );
}
