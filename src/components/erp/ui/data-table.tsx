import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";
import { SkeletonBlock } from "./skeleton-block";

export type DataTableColumn<T> = {
  /** Stable key, also used as React key. */
  key: string;
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: T, index: number) => ReactNode;
  /** Right-aligns + tabular-nums. */
  numeric?: boolean;
  /** Fixed/preferred width, e.g. "160px" or "20%". */
  width?: string;
  className?: string;
  headerClassName?: string;
};

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Hover-revealed action cluster, right aligned in its own column. */
  rowActions?: (row: T, index: number) => ReactNode;
  onRowClick?: (row: T, index: number) => void;
  loading?: boolean;
  skeletonRows?: number;
  /** Always provided — the table never renders a blank body. */
  empty?: ReactNode;
  /** Sticky header (default true). Needs a scroll container height. */
  stickyHeader?: boolean;
  /** Reserved: real row virtualization lands in Phase 6. Prop signature is final. */
  virtualized?: boolean;
  className?: string;
  /** Applied to the scroll container, e.g. "max-h-[70vh]". */
  containerClassName?: string;
};

/**
 * The shared table shell: sticky header, no zebra striping, density-aware row
 * height (`--row-height`), numeric columns right-aligned, hover row actions.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowActions,
  onRowClick,
  loading = false,
  skeletonRows = 6,
  empty,
  stickyHeader = true,
  virtualized = false,
  className,
  containerClassName,
}: DataTableProps<T>) {
  void virtualized; // Phase 6
  const colCount = columns.length + (rowActions ? 1 : 0);

  return (
    <div className={cn("relative w-full overflow-auto", containerClassName)}>
      <table className={cn("v2-table w-full border-collapse", className)}>
        <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                data-numeric={c.numeric ? "true" : undefined}
                style={c.width ? { width: c.width } : undefined}
                className={cn("border-b border-border", c.headerClassName)}
              >
                {c.header}
              </th>
            ))}
            {rowActions && <th className="w-px border-b border-border" aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-b border-border/60">
                {Array.from({ length: colCount }).map((__, j) => (
                  <td key={j}>
                    <SkeletonBlock height={10} className={j === 0 ? "w-2/3" : "w-1/2"} />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={colCount} className="!h-auto">
                {empty ?? <EmptyState compact title="কিছু পাওয়া যায়নি" description="এই ফিল্টারে কোনো ডেটা নেই।" />}
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row, i) : undefined}
                className={cn("group border-b border-border/60 last:border-b-0", onRowClick && "cursor-pointer")}
              >
                {columns.map((c) => (
                  <td key={c.key} data-numeric={c.numeric ? "true" : undefined} className={c.className}>
                    {c.cell(row, i)}
                  </td>
                ))}
                {rowActions && (
                  <td className="w-px whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity duration-[var(--motion-fast)] ease-out group-hover:opacity-100 group-focus-within:opacity-100">
                      {rowActions(row, i)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
