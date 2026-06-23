"use client";

import { useState, type ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, LockIcon } from "@/components/icons";

export type StageState = "active" | "complete" | "locked";

const CIRCLE_STYLES: Record<StageState, string> = {
  active: "border-2 border-accent bg-background text-accent",
  complete: "border-2 border-transparent bg-green-500 text-white",
  locked: "border-2 border-transparent bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
};

interface PipelineStageProps {
  index: number;
  title: string;
  state: StageState;
  isLast?: boolean;
  badge?: ReactNode;
  children: ReactNode;
  /** When true, content can be collapsed/expanded by clicking the header. */
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

export function PipelineStage({
  index,
  title,
  state,
  isLast,
  badge,
  children,
  collapsible = false,
  defaultExpanded = true,
}: PipelineStageProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors duration-200 ${CIRCLE_STYLES[state]}`}
        >
          {state === "complete" ? (
            <CheckIcon className="h-4 w-4" strokeWidth={2.5} />
          ) : state === "locked" ? (
            <LockIcon className="h-3.5 w-3.5" />
          ) : (
            index
          )}
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-800" />}
      </div>

      <div className="flex-1 pb-10">
        <div
          className={`rounded-xl border transition-all duration-200 ${
            state === "active"
              ? "border-accent/40 bg-accent/[0.03]"
              : "border-gray-200 dark:border-gray-800"
          } ${state === "locked" ? "opacity-60" : ""}`}
        >
          <button
            type="button"
            onClick={() => collapsible && setExpanded((v) => !v)}
            className={`flex w-full items-center justify-between gap-3 p-6 text-left ${
              collapsible ? "cursor-pointer" : "cursor-default"
            } ${expanded ? "pb-0" : ""}`}
          >
            <h3 className="text-base font-medium text-foreground">{title}</h3>
            <div className="flex items-center gap-2">
              {badge}
              {collapsible && (
                <ChevronDownIcon
                  className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${
                    expanded ? "rotate-180" : ""
                  }`}
                />
              )}
            </div>
          </button>
          {expanded && <div className="p-6 pt-4">{children}</div>}
        </div>
      </div>
    </div>
  );
}
