import { Suspense } from "react";
import { DashboardContent } from "./DashboardContent";
import { ProjectGridSkeleton } from "@/components/dashboard/Skeleton";

// DashboardContent uses useSearchParams (filters/sort live in the URL), which
// Next 16 requires to sit behind a Suspense boundary or production builds
// fail with "Missing Suspense boundary with useSearchParams" — dev mode
// renders routes on-demand and won't surface this, so it only shows up at
// build time.
function DashboardFallback() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950/40">
      <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
        <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="mt-12">
          <ProjectGridSkeleton />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent />
    </Suspense>
  );
}
