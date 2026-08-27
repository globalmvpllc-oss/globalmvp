import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { checkAdmin } from '@/lib/admin/auth';

/**
 * The admin shell.
 *
 * Authorisation happens here, on the server, before any child renders. A
 * non-administrator never receives the markup — this is not a hidden route that
 * relies on the navigation not linking to it.
 *
 * Middleware already requires a session for anything under /admin; what it
 * cannot do is check the database, which is why the second half of the decision
 * lives here.
 */
export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/invoices', label: 'Invoices' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/logs', label: 'Audit Logs' },
  { href: '/admin/security', label: 'Security' },
  { href: '/admin/settings', label: 'Settings' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const check = await checkAdmin();

  if (!check.ok) {
    // Signed in but not an administrator: back to their own application rather
    // than an error page that confirms an admin panel exists here.
    if (check.reason === 'unauthenticated') redirect('/auth/login');
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2 font-display font-bold">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Admin
          </div>
          {/* Kept visually distinct from the product navigation so it is never
              mistaken for the signed-in user's own workspace. */}
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-muted-foreground">{check.admin.email}</span>
          <Link href="/dashboard" className="text-xs text-primary hover:underline">
            Back to app
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
