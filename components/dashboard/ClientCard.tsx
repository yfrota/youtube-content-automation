"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientWithProjectsCount } from "@/lib/dashboard/types";
import { Avatar } from "./Avatar";

export function ClientCard({ client }: { client: ClientWithProjectsCount }) {
  const router = useRouter();

  return (
    // Same click-anywhere-navigates + real <Link> on the name pattern as
    // ProjectCard — no nested-interactive-content concern here (no actions
    // menu on this card per the spec), but kept consistent anyway.
    <div
      onClick={() => router.push(`/clients/${client.id}`)}
      className="group cursor-pointer rounded-xl border border-gray-200 bg-background p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:border-gray-800 dark:hover:border-gray-700"
    >
      <div className="flex items-center gap-3">
        <Avatar name={client.name} imageUrl={client.imageUrl} className="h-10 w-10 text-sm" />
        <div className="min-w-0">
          <Link
            href={`/clients/${client.id}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-base font-medium text-foreground hover:underline"
          >
            {client.name}
          </Link>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {client.projectsCount} projeto{client.projectsCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {(client.email || client.phone) && (
        <div className="mt-3 flex flex-col gap-0.5 text-xs text-gray-500 dark:text-gray-400">
          {client.email && <p className="truncate">{client.email}</p>}
          {client.phone && <p className="truncate">{client.phone}</p>}
        </div>
      )}

      {client.description && (
        <p className="mt-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
          {client.description}
        </p>
      )}
    </div>
  );
}
