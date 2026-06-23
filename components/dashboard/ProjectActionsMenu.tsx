"use client";

import { useEffect, useRef, useState } from "react";
import { EllipsisIcon, PencilIcon, TrashIcon } from "@/components/icons";

export function ProjectActionsMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    // stopPropagation here, not left to each caller, so this menu is safe to
    // drop into a card whose own surface navigates on click.
    <div ref={containerRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ações do projeto"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-foreground dark:hover:bg-gray-800/70"
      >
        <EllipsisIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="animate-fade-in absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-gray-200 bg-background py-1 shadow-lg dark:border-gray-800">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-600 transition-colors duration-200 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50"
          >
            <PencilIcon className="h-3.5 w-3.5" />
            Editar
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors duration-200 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Excluir
          </button>
        </div>
      )}
    </div>
  );
}
