import { PlusIcon } from "@/components/icons";

export function EmptyState({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-8 py-20 text-center dark:border-gray-800">
      <svg
        width="96"
        height="96"
        viewBox="0 0 96 96"
        fill="none"
        aria-hidden="true"
        className="text-gray-300 dark:text-gray-600"
      >
        <rect
          x="18"
          y="28"
          width="60"
          height="44"
          rx="6"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M18 40h60"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M30 22h36"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="48" cy="56" r="9" stroke="currentColor" strokeWidth="2" />
        <path
          d="M48 52v8M44 56h8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      <h3 className="mt-6 text-lg font-light text-foreground">
        Nenhum projeto ainda
      </h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
        Crie seu primeiro projeto para começar a transformar transcrições em
        roteiros, SEO e thumbnails prontos para publicar.
      </p>

      <button
        type="button"
        onClick={onCreate}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-accent-hover"
      >
        <PlusIcon className="h-4 w-4" />
        Novo projeto
      </button>
    </div>
  );
}
