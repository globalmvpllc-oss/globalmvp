import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

/**
 * The shared shape of every admin listing.
 *
 * One component rather than ten near-copies, so pagination, the empty state and
 * the horizontal scroll behave identically everywhere and a fix lands once.
 */

export interface Column<Row> {
  key: string;
  header: string;
  /** Returns a cell. Kept as a function so a page can format its own values. */
  cell: (row: Row) => React.ReactNode;
  className?: string;
}

export function AdminTable<Row extends { id: string }>({
  rows,
  columns,
  emptyMessage,
}: {
  rows: Row[];
  columns: Array<Column<Row>>;
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardContent className="overflow-x-auto py-4">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              {columns.map((column) => (
                <th key={column.key} className={`py-2 pr-3 font-medium ${column.className ?? ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/50 last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className={`py-2 pr-3 ${column.className ?? ''}`}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Search box and page links, sharing one query string. */
export function AdminListControls({
  basePath,
  page,
  totalPages,
  total,
  search,
  searchPlaceholder,
  extraParams = {},
}: {
  basePath: string;
  page: number;
  totalPages: number;
  total: number;
  search: string | null;
  searchPlaceholder: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const linkFor = (targetPage: number) => {
    const params = new URLSearchParams();
    params.set('page', String(targetPage));
    if (search) params.set('q', search);
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) params.set(key, value);
    }
    return `${basePath}?${params.toString()}`;
  };

  return (
    <>
      <form className="flex gap-2" action={basePath}>
        <input
          name="q"
          defaultValue={search ?? ''}
          placeholder={searchPlaceholder}
          className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        {Object.entries(extraParams).map(([key, value]) =>
          value ? <input key={key} type="hidden" name={key} value={value} /> : null
        )}
        <button className="rounded-md border border-border px-3 py-1.5 text-sm">Search</button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {total} total · page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={linkFor(page - 1)} className="rounded-md border border-border px-3 py-1.5">
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link href={linkFor(page + 1)} className="rounded-md border border-border px-3 py-1.5">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </>
  );
}
