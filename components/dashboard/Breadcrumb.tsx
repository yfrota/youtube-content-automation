import { Fragment } from "react";
import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        {items.map((item, i) => {
          const isCurrent = i === items.length - 1;
          return (
            <Fragment key={item.label}>
              {i > 0 && <li aria-hidden="true">/</li>}
              <li className={isCurrent ? "text-gray-600 dark:text-gray-300" : ""}>
                {/* Current page is plain text, never a link — there's nowhere
                    "more current" to navigate to. */}
                {item.href && !isCurrent ? (
                  <Link href={item.href} className="transition-colors duration-200 hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  item.label
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
