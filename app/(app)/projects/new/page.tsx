import { Suspense } from "react";
import { NewProjectContent } from "./NewProjectContent";

// NewProjectContent uses useSearchParams (?clientId= preselection), which
// Next 16 requires behind a Suspense boundary or the production build fails
// — same requirement as app/dashboard/page.tsx, see its comment for why dev
// mode never surfaces this.
export default function NewProjectPage() {
  return (
    <Suspense fallback={null}>
      <NewProjectContent />
    </Suspense>
  );
}
