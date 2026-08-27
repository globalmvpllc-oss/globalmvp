import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Shared building blocks for the admin detail pages.
 *
 * One set of primitives so every detail screen — company, user, invoice,
 * payment, subscription — lays out the same way, and a change to spacing or the
 * empty dash lands once. All read-only: the admin panel shows records, it does
 * not offer a control that would rewrite one from here.
 */

export function AdminBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}

export function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">{children}</dl>;
}

/** A label/value pair. Renders an em dash for anything empty. */
export function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono text-xs break-all' : 'font-medium'}>
        {empty ? '—' : value}
      </dd>
    </div>
  );
}

/** A compact read-only table for a detail page's related records. */
export function DetailTable<Row extends { id: string }>({
  columns,
  rows,
  emptyMessage,
}: {
  columns: Array<{ key: string; header: string; cell: (row: Row) => React.ReactNode; className?: string }>;
  rows: Row[];
  emptyMessage: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
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
              <td colSpan={columns.length} className="py-6 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
