"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import {
  ChevronDownIcon,
  DocumentIcon,
  SearchIcon,
  PhotoIcon,
  ChecklistIcon,
  PlayCircleIcon,
} from "@/components/icons";
import {
  MODULE_LABELS,
  projectProgress,
  type Project,
  type ModuleKey,
} from "@/lib/dashboard/types";
import { relativeTime } from "@/lib/time";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";
import { DOT_STYLES, isAwaitingReview } from "./statusStyles";

const MODULE_ICONS: Record<ModuleKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  script: DocumentIcon,
  seo: SearchIcon,
  thumbnail: PhotoIcon,
  checklist: ChecklistIcon,
};

export function ProjectCard({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const progress = projectProgress(project);

  return (
    <div className="rounded-xl border border-gray-200 bg-background transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg hover:shadow-black/5 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:shadow-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full cursor-pointer p-5 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-normal leading-snug text-foreground">
            {project.title}
          </h3>
          <span
            className="flex shrink-0 items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:bg-gray-800/60 dark:text-gray-500"
            title="YouTube"
          >
            <PlayCircleIcon className="h-3.5 w-3.5" />
            YouTube
          </span>
        </div>

        <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
          {project.channelName} · {relativeTime(project.updatedAt)}
        </p>

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
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open && (
        <div className="animate-fade-in border-t border-gray-100 px-5 py-4 dark:border-gray-800">
          <ul className="flex flex-col gap-3">
            {project.modules.map((mod) => {
              const Icon = MODULE_ICONS[mod.key];
              return (
                <li key={mod.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-300">
                    <Icon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    {MODULE_LABELS[mod.key]}
                  </span>
                  <StatusBadge status={mod.status} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
