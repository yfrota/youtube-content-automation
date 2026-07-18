import { DashboardContent } from "./DashboardContent";

// No longer needs a Suspense boundary — DashboardContent doesn't read
// useSearchParams anymore (single filter, plain useState). The full
// URL-backed filter set now lives at /projects.
export default function DashboardPage() {
  return <DashboardContent />;
}
