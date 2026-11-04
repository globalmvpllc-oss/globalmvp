'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Home, Package, ClipboardList, History, Truck, Settings, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { useKs } from './ks-context';

/**
 * Phone-first frame: brand at the top, big tab bar at the bottom (one thumb).
 * Tabs a person may not use are not shown; the server refuses them anyway.
 */
export function KsShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const ks = useKs();
  const pathname = usePathname() ?? '';

  const tabs: Array<{ href: string; key: TranslationKey; icon: typeof Home; show: boolean }> = [
    { href: '/kolaystok/app', key: 'ks.nav.home', icon: Home, show: true },
    { href: '/kolaystok/app/products', key: 'ks.nav.products', icon: Package, show: ks.permissions.products },
    { href: '/kolaystok/app/count', key: 'ks.nav.count', icon: ClipboardList, show: ks.permissions.count },
    { href: '/kolaystok/app/movements', key: 'ks.nav.movements', icon: History, show: true },
    { href: '/kolaystok/app/suppliers', key: 'ks.nav.suppliers', icon: Truck, show: ks.permissions.suppliers },
    { href: '/kolaystok/app/settings', key: 'ks.nav.settings', icon: Settings, show: ks.permissions.settings },
  ];
  const visible = tabs.filter((tab) => tab.show);

  const leave = async () => {
    if (ks.kind === 'staff') {
      await fetch('/api/stock/logout', { method: 'POST' }).catch(() => {});
      window.location.href = '/kolaystok';
    } else {
      await signOut({ callbackUrl: '/kolaystok' });
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight text-teal-700">{t('ks.brand')}</p>
          <p className="truncate text-sm text-slate-500">
            {ks.companyName} · {ks.name}
          </p>
        </div>
        <button
          type="button"
          onClick={leave}
          className="flex h-11 items-center gap-2 rounded-lg border px-3 text-base text-slate-600"
          aria-label={t('ks.signOut')}
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          <span className="hidden sm:inline">{t('ks.signOut')}</span>
        </button>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-3 pb-28 pt-3">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-white pb-[env(safe-area-inset-bottom)]"
        aria-label={t('ks.brand')}
      >
        <ul className="mx-auto grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
          {visible.map((tab) => {
            const active = tab.href === '/kolaystok/app' ? pathname === tab.href : pathname.startsWith(tab.href);
            const Icon = tab.icon;
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${active ? 'text-teal-700' : 'text-slate-500'}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  {t(tab.key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
