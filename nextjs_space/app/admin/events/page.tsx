import { prisma } from '@/lib/db';
import { prepareAdminList, totalPages } from '@/lib/admin/list';
import { AdminTable, AdminListControls } from '@/components/admin-table';

export const dynamic = 'force-dynamic';

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | undefined>;
}) {
  const context = await prepareAdminList(searchParams, 'admin.events.listed');
  if (!context) return null;
  const { page, pageSize, skip, search } = context;

  const where = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { company: { name: { contains: search, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const [total, events] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      orderBy: { startAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        title: true,
        type: true,
        startAt: true,
        endAt: true,
        company: { select: { name: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Events</h1>
        <p className="text-muted-foreground">{total} calendar events across all companies</p>
      </div>

      <AdminListControls
        basePath="/admin/events"
        page={page}
        totalPages={totalPages(total, pageSize)}
        total={total}
        search={search}
        searchPlaceholder="Search title or company"
      />

      <AdminTable
        rows={events as any[]}
        emptyMessage="No events match this search."
        columns={[
          { key: 'title', header: 'Title', cell: (e: any) => e.title },
          { key: 'type', header: 'Type', cell: (e: any) => e.type ?? '\u2014' },
          { key: 'company', header: 'Company', cell: (e: any) => e.company?.name ?? '\u2014' },
          {
            key: 'start',
            header: 'Starts',
            className: 'font-mono text-xs',
            cell: (e: any) => e.startAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '\u2014',
          },
        ]}
      />
    </div>
  );
}
