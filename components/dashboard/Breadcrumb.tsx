import { Fragment } from "react";
import Link from "next/link";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-xs text-halo-text-muted">
        {items.map((item, i) => {
          const isCurrent = i === items.length - 1;
          return (
            <Fragment key={item.label}>
              {i > 0 && <li aria-hidden="true">/</li>}
              <li className={isCurrent ? "text-halo-text" : ""}>
                {/* Current page is plain text, never a link — there's nowhere
                    "more current" to navigate to. */}
                {item.href && !isCurrent ? (
                  <Link href={item.href} className="transition-colors duration-200 hover:text-halo-text">
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
