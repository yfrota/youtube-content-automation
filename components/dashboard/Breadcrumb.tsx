import { Fragment } from "react";

export interface Crumb {
  label: string;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        {items.map((item, i) => (
          <Fragment key={item.label}>
            {i > 0 && <li aria-hidden="true">/</li>}
            <li
              className={
                i === items.length - 1
                  ? "text-gray-600 dark:text-gray-300"
                  : ""
              }
            >
              {item.label}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
