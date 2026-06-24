function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-shimmer rounded-md bg-gray-100 dark:bg-gray-800 ${className}`}
    />
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 p-5 shadow-sm dark:border-gray-800">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bar className="h-6 w-6 rounded-full" />
          <Bar className="h-3 w-24" />
        </div>
        <Bar className="h-5 w-5 rounded-full" />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <Bar className="h-4 w-2/3" />
        <Bar className="h-5 w-16 rounded-full" />
      </div>
      <Bar className="mt-2 h-3 w-1/2" />
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

export function ClientCardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 p-5 shadow-sm dark:border-gray-800">
      <div className="flex items-center gap-3">
        <Bar className="h-10 w-10 rounded-full" />
        <div className="flex-1">
          <Bar className="h-4 w-2/3" />
          <Bar className="mt-2 h-3 w-1/3" />
        </div>
      </div>
      <Bar className="mt-4 h-3 w-1/2" />
      <Bar className="mt-2 h-3 w-3/4" />
    </div>
  );
}

export function ClientGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <ClientCardSkeleton key={i} />
      ))}
    </div>
  );
}
