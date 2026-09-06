import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserCompanyId } from '@/lib/auth-helpers';
import { AppSidebar } from '@/components/app-sidebar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/auth/login');

  /**
   * A signed-in user with no company cannot use anything in here.
   *
   * Every company-scoped route resolves through requireUserCompany(), which
   * answers 403 "No company access" when no CompanyMember row exists. Without
   * this check the application still rendered, because GET /api/company returns
   * 200 with a null body instead of an error — so the screens filled themselves
   * with nothing and looked merely empty while every action behind them failed.
   * Logo upload was simply the first place that surfaced as a visible error
   * rather than as blankness.
   *
   * Onboarding creates the company and redirects back once one exists, so this
   * cannot loop.
   *
   * Resolved through `getUserCompanyId` rather than a `findFirst` of its own.
   * A second lookup here could disagree with the one every API route uses —
   * admitting a user the routes then refuse, or sending one to onboarding who
   * has a perfectly good company. It also inherits the `user.isActive` filter,
   * which the local query did not have: a deactivated account used to render
   * the whole application and get 403 from every request behind it.
   */
  const companyId = await getUserCompanyId();
  if (!companyId) redirect('/onboarding');

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      {/*
        `min-w-0` keeps a wide child (a table, a long invoice number) from
        stretching this flex item past the viewport, which is what turns a
        scrollable table into a horizontally scrolling page.

        `pt-14` clears the fixed mobile header the sidebar renders below `md`;
        at `md` and above there is no such header and no offset.
      */}
      <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
