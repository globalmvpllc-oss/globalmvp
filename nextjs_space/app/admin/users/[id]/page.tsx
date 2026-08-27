import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { checkAdmin } from '@/lib/admin/auth';
import { recordAudit } from '@/lib/admin/audit';
import { AdminBackLink, DetailCard, FieldGrid, Field, DetailTable } from '@/components/admin-detail';

/**
 * A single user, read-only.
 *
 * The select is explicit: hashedPassword, tokens and provider credentials are
 * never read, so they cannot reach the page. Company/membership context comes
 * from CompanyMember; the plan shown is the company's, resolved from its
 * subscription — never something an admin sets here.
 */
export const dynamic = 'force-dynamic';

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '—');

export default async function AdminUserDetailPage({ params }: { params: { id: string } }) {
  const check = await checkAdmin();
  if (!check.ok) return null;

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      email: true,
      emailVerified: true,
      language: true,
      createdAt: true,
      companyMembers: {
        select: {
          id: true,
          role: true,
          createdAt: true,
          company: {
            select: {
              id: true,
              name: true,
              subscription: { select: { plan: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!user) notFound();

  await recordAudit({
    admin: check.admin,
    action: 'admin.user.viewed',
    entityType: 'user',
    entityId: user.id,
  });

  return (
    <div className="space-y-4">
      <AdminBackLink href="/admin/users" label="Back to users" />
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{user.name || user.email}</h1>
        <p className="text-muted-foreground">{user.email}</p>
      </div>

      <DetailCard title="Account">
        <FieldGrid>
          <Field label="Name" value={user.name} />
          <Field label="Email" value={user.email} />
          <Field label="Email verified" value={user.emailVerified ? day(user.emailVerified) : 'no'} />
          <Field label="Language" value={user.language} />
          <Field label="Created" value={day(user.createdAt)} mono />
        </FieldGrid>
        <p className="mt-3 text-xs text-muted-foreground">
          The User model records no active/inactive flag and no last-login time, so neither is shown —
          adding either needs a schema change.
        </p>
      </DetailCard>

      <DetailCard title={`Companies (${user.companyMembers.length})`}>
        <DetailTable
          rows={user.companyMembers as any[]}
          emptyMessage="This user belongs to no company yet."
          columns={[
            {
              key: 'company',
              header: 'Company',
              cell: (m: any) => (
                <Link href={`/admin/companies/${m.company?.id}`} className="text-primary hover:underline">
                  {m.company?.name ?? '—'}
                </Link>
              ),
            },
            { key: 'role', header: 'Role', cell: (m: any) => m.role },
            { key: 'plan', header: 'Plan', cell: (m: any) => m.company?.subscription?.plan ?? 'free' },
            {
              key: 'status',
              header: 'Plan status',
              cell: (m: any) => m.company?.subscription?.status ?? '—',
            },
            { key: 'since', header: 'Member since', className: 'font-mono text-xs', cell: (m: any) => day(m.createdAt) },
          ]}
        />
      </DetailCard>
    </div>
  );
}
