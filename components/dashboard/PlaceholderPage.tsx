import { Breadcrumb } from "./Breadcrumb";
import { SparklesIcon } from "@/components/icons";

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12 sm:px-8 sm:py-16">
      <Breadcrumb items={[{ label: "Início" }, { label: title }]} />

      <h1 className="mt-6 text-2xl font-light tracking-tight text-foreground">
        {title}
      </h1>

      <div className="mt-10 flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 px-8 py-24 text-center dark:border-gray-800">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 text-gray-400 dark:bg-gray-800/60 dark:text-gray-500">
          <SparklesIcon className="h-6 w-6" />
        </span>
        <p className="mt-4 text-lg font-light text-foreground">Em construção</p>
        <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Esta seção ainda está sendo desenvolvida.
        </p>
      </div>
    </div>
  );
}
