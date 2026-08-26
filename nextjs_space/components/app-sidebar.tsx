'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, FileText, Users, TrendingUp, TrendingDown,
  CreditCard, CalendarDays, BarChart3, Settings, LogOut, ChevronLeft, ChevronRight, Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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
  { href: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays },
  { href: '/reports', labelKey: 'nav.reports', icon: BarChart3 },
  { href: '/settings', labelKey: 'nav.settings', icon: Settings },
  { href: '/settings/billing', labelKey: 'nav.billing', icon: Wallet },
];

export function AppSidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
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

  const companyName = getCompanyDisplayName(company?.name);
  const initials = getCompanyInitials(company?.name);

  return (
    <aside className={cn(
      'flex flex-col bg-card border-r border-border h-screen sticky top-0 transition-all duration-300',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b border-border">
        <div
          className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 overflow-hidden"
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
        {!collapsed && (
          <span className="text-lg font-display font-bold tracking-tight truncate" title={companyName}>
            {companyName}
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {NAV_ITEMS.map((item: any) => {
          const Icon = item.icon;
          /**
           * Exact match, or a descendant that is not itself a navigation item.
           *
           * /settings/billing is its own entry, so the prefix rule alone would
           * light up Settings as well and show two active items at once.
           */
          const active =
            pathname === item.href ||
            (pathname?.startsWith(item.href + '/') &&
              !NAV_ITEMS.some((other: { href: string }) => other.href !== item.href && pathname === other.href));
          return (
            <Link
              key={item.href}
              href={item.href}
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
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-2">
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
  );
}
