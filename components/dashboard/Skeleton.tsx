function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-md bg-gray-100 dark:bg-gray-800 ${className}`}
    />
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
      <div className="flex items-start justify-between gap-3">
        <Bar className="h-4 w-3/4" />
        <Bar className="h-5 w-5 rounded-full" />
      </div>
      <Bar className="mt-4 h-3 w-1/3" />
      <Bar className="mt-6 h-1.5 w-full rounded-full" />
      <div className="mt-5 flex gap-2">
        <Bar className="h-2 w-2 rounded-full" />
        <Bar className="h-2 w-2 rounded-full" />
        <Bar className="h-2 w-2 rounded-full" />
        <Bar className="h-2 w-2 rounded-full" />
      </div>
    </div>
  );
}

export function ProjectGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </div>
  );
}
