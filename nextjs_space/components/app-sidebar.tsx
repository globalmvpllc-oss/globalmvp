'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, FileText, Users, TrendingUp, TrendingDown,
  CreditCard, CalendarDays, BarChart3, Settings, LogOut, ChevronLeft, ChevronRight, Wallet, Menu,
  Landmark,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { getCompanyInitials, getCompanyDisplayName, resolveStoredFileUrl } from '@/lib/company-identity';
import { useI18n } from '@/components/i18n-provider';
import { LanguageSelector } from '@/components/language-selector';

const NAV_ITEMS = [
  // The label is a translation key, resolved at render time so switching
  // language re-labels the navigation without remounting it.
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/invoices', labelKey: 'nav.invoices', icon: FileText },
  { href: '/customers', labelKey: 'nav.customers', icon: Users },
  { href: '/income', labelKey: 'nav.income', icon: TrendingUp },
  { href: '/expenses', labelKey: 'nav.expenses', icon: TrendingDown },
  { href: '/payments', labelKey: 'nav.payments', icon: CreditCard },
  { href: '/banking', labelKey: 'nav.banking', icon: Landmark },
  { href: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays },
  { href: '/reports', labelKey: 'nav.reports', icon: BarChart3 },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
  { href: '/settings/billing', labelKey: 'nav.billing', icon: Wallet },
];

/**
 * Exact match, or a descendant that is not itself a navigation item.
 *
 * /settings/billing is its own entry, so the prefix rule alone would light up
 * Settings as well and show two active items at once.
 */
function isActive(href: string, pathname: string | null): boolean {
  return Boolean(
    pathname === href ||
      (pathname?.startsWith(href + '/') &&
        !NAV_ITEMS.some((other: { href: string }) => other.href !== href && pathname === other.href))
  );
}

/** The square logo/initials badge, shown in the sidebar, the drawer and the bar. */
function CompanyMark({
  logoUrl,
  initials,
  companyName,
  className,
}: {
  logoUrl: string | null;
  initials: string;
  companyName: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 overflow-hidden',
        className
      )}
      title={companyName}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="w-full h-full object-contain" />
      ) : initials ? (
        <span className="text-xs font-display font-bold text-white">{initials}</span>
      ) : (
        <BarChart3 className="w-5 h-5 text-white" aria-hidden="true" />
      )}
    </div>
  );
}

/**
 * The navigation links themselves.
 *
 * Shared by the persistent sidebar and the drawer so both always offer the same
 * destinations in the same order; `onNavigate` is how the drawer closes itself
 * when a link is followed.
 */
function SidebarNav({
  pathname,
  collapsed,
  onNavigate,
  t,
}: {
  pathname: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
  t: (key: any) => string;
}) {
  return (
    <>
      {NAV_ITEMS.map((item: any) => {
        const Icon = item.icon;
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{t(item.labelKey)}</span>}
          </Link>
        );
      })}
    </>
  );
}

/** Language selector and Sign out — the same footer in the sidebar and drawer. */
function SidebarFooterActions({
  collapsed,
  t,
}: {
  collapsed: boolean;
  t: (key: any) => string;
}) {
  return (
    <>
      {/* Hidden when collapsed: the trigger has no room for a readable
          language name, and an icon alone would be ambiguous. */}
      {!collapsed ? <LanguageSelector /> : null}

      <button
        onClick={() => signOut({ callbackUrl: '/auth/login' })}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground w-full transition-colors"
      >
        <LogOut className="w-5 h-5 flex-shrink-0" />
        {!collapsed && <span>{t('nav.signOut')}</span>}
      </button>
    </>
  );
}

export function AppSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  /** Drawer state. Only reachable below `md`, where the sidebar is off-canvas. */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [company, setCompany] = useState<any>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // The sidebar shows the user's own business rather than the product name.
  useEffect(() => {
    let active = true;
    fetch('/api/company')
      .then((r: any) => (r.ok ? r.json() : null))
      .then((d: any) => { if (active) setCompany(d); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    resolveStoredFileUrl(company?.logoUrl).then((url: string | null) => {
      if (active) setLogoUrl(url);
    });
    return () => { active = false; };
  }, [company?.logoUrl]);

  /**
   * A drawer left open behind a new page is the classic annoyance, so the route
   * closes it as well as the link that was tapped. Both are needed: tapping the
   * entry for the page you are already on does not change the pathname.
   */
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const companyName = getCompanyDisplayName(company?.name);
  const initials = getCompanyInitials(company?.name);

  return (
    <>
      {/*
        Small screens: the sidebar is off-canvas and this bar is the only
        navigation. Fixed rather than a flex child, so below `md` the sidebar
        contributes no layout width at all and the page gets the full viewport.
        The content area reserves its height with `pt-14` in the layout.
      */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-card px-2 md:hidden">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          {/* Radix owns the rest of the drawer behaviour: the backdrop closes
              it, Escape closes it, focus is trapped while it is open and
              returns to this trigger when it shuts. */}
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('nav.openMenu')} className="h-11 w-11 shrink-0">
              <Menu className="w-5 h-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-[17rem] flex-col gap-0 p-0">
            <SheetTitle asChild>
              <div className="flex items-center gap-2 border-b border-border px-4 py-4 pr-12">
                <CompanyMark logoUrl={logoUrl} initials={initials} companyName={companyName} />
                <span className="text-lg font-display font-bold tracking-tight truncate" title={companyName}>
                  {companyName}
                </span>
              </div>
            </SheetTitle>

            <nav aria-label={t('nav.menu')} className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
              <SidebarNav
                pathname={pathname}
                collapsed={false}
                onNavigate={() => setDrawerOpen(false)}
                t={t}
              />
            </nav>

            <div className="border-t border-border p-2">
              <SidebarFooterActions collapsed={false} t={t} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 items-center gap-2">
          <CompanyMark logoUrl={logoUrl} initials={initials} companyName={companyName} />
          <span className="truncate font-display font-bold tracking-tight" title={companyName}>
            {companyName}
          </span>
        </div>
      </header>

      {/* `md` and above: unchanged — persistent, collapsible, in the flow. */}
      <aside className={cn(
        'hidden md:flex flex-col bg-card border-r border-border h-screen sticky top-0 transition-all duration-300',
        collapsed ? 'w-16' : 'w-60'
      )}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
          <CompanyMark logoUrl={logoUrl} initials={initials} companyName={companyName} />
          {!collapsed && (
            <span className="text-lg font-display font-bold tracking-tight truncate" title={companyName}>
              {companyName}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          <SidebarNav pathname={pathname} collapsed={collapsed} t={t} />
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-2">
          <SidebarFooterActions collapsed={collapsed} t={t} />

          <Button
            variant="ghost"
            size="icon"
            className="w-full mt-1"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>
      </aside>
    </>
  );
}
