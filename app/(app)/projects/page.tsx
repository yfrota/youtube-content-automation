import { Suspense } from "react";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { ProjectGridSkeleton } from "@/components/dashboard/Skeleton";

// ProjectsView uses useSearchParams (filters/sort/groupBy live in the URL),
// which Next 16 requires behind a Suspense boundary or the production build
// fails — same requirement as app/dashboard/page.tsx used to have.
function ProjectsFallback() {
  return (
    <div className="min-h-screen bg-halo-bg">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-8 sm:py-16">
        <div className="h-3 w-32 rounded bg-halo-border" />
        <div className="mt-12">
          <ProjectGridSkeleton />
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ProjectsFallback />}>
      <ProjectsView />
    </Suspense>
  );
}
