import { Card, CardContent } from '@/components/ui/card';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { parsePagination, parseSearch } from '@/lib/admin/access';
import Link from 'next/link';

/**
 * The audit trail — searchable and filterable by action and date.
 *
 * Paged on the server: the query takes only the current page, so the table
 * cannot be pulled whole by asking for it. Metadata is shown per row (already
 * redacted on write) so a reviewer can see the context of an action without a
 * second query.
 */
export const dynamic = 'force-dynamic';

/** Reads a 'YYYY-MM-DD' value, returning null for anything unparseable. */
function boundedDate(value: string | undefined, end: boolean): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const check = await checkAdmin();
  if (!check.ok) return null;

  const params = new URLSearchParams(
    Object.entries(searchParams ?? {}).filter(([, value]) => value !== undefined) as [string, string][]
  );
  const { page, pageSize, skip } = parsePagination(params);
  const search = parseSearch(params);
  const action = params.get('action') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const company = params.get('company') || '';

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (company) where.companyId = company;
  const createdAt: { gte?: Date; lte?: Date } = {};
  const fromDate = boundedDate(from, false);
  const toDate = boundedDate(to, true);
  if (fromDate) createdAt.gte = fromDate;
  if (toDate) createdAt.lte = toDate;
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;
  if (search) {
    where.OR = [
      { actorEmail: { contains: search, mode: 'insensitive' as const } },
      { action: { contains: search, mode: 'insensitive' as const } },
      { entityId: { contains: search, mode: 'insensitive' as const } },
    ];
  }

  const [total, entries, actionGroups] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
    // Distinct actions present, so the filter offers only what exists.
    prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { action: 'asc' } }),
  ]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  const pageLink = (targetPage: number) => {
    const p = new URLSearchParams();
    p.set('page', String(targetPage));
    if (search) p.set('q', search);
    if (action) p.set('action', action);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (company) p.set('company', company);
    return `/admin/logs?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground">{total} entries</p>
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/admin/logs">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Search</label>
          <input
            name="q"
            defaultValue={search ?? ''}
            placeholder="Actor, action or entity id"
            className="w-56 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Action</label>
          <select
            name="action"
            defaultValue={action}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">All actions</option>
            {actionGroups.map((row: { action: string; _count: { _all: number } }) => (
              <option key={row.action} value={row.action}>
                {row.action} ({row._count._all})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Company id</label>
          <input
            name="company"
            defaultValue={company}
            placeholder="Filter by company id"
            className="w-44 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <button className="rounded-md border border-border px-3 py-1.5 text-sm">Filter</button>
        {search || action || from || to || company ? (
          <Link href="/admin/logs" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Clear
          </Link>
        ) : null}
      </form>

      <Card>
        <CardContent className="overflow-x-auto py-4">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Actor</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Entity</th>
                <th className="py-2 pr-3 font-medium">IP</th>
                <th className="py-2 pr-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry: any) => {
                const hasMeta = entry.metadata != null || entry.userAgent;
                return (
                  <tr key={entry.id} className="border-b border-border/50 align-top last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">
                      {entry.createdAt.toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2 pr-3">{entry.actorEmail}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{entry.action}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {entry.entityType ? `${entry.entityType}:${entry.entityId ?? ''}` : '—'}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{entry.ip ?? '—'}</td>
                    <td className="py-2 pr-3 text-xs">
                      {hasMeta ? (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            view
                          </summary>
                          <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">
                            {JSON.stringify(entry.metadata ?? {}, null, 2)}
                          </pre>
                          {entry.userAgent ? (
                            <p className="mt-1 break-all text-[11px] text-muted-foreground">
                              UA: {entry.userAgent}
                            </p>
                          ) : null}
                        </details>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nothing matches these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={pageLink(page - 1)} className="rounded-md border border-border px-3 py-1.5">
              Previous
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link href={pageLink(page + 1)} className="rounded-md border border-border px-3 py-1.5">
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
