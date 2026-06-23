import { LockIcon } from "@/components/icons";

export function LockedStageContent({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
      <LockIcon className="h-4 w-4" />
      {message}
    </div>
  );
}
