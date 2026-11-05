'use client';

import Link from 'next/link';
import { Truck, Mail, FileSpreadsheet, FileText, Files, Settings, ChevronRight } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { useKs } from '@/components/kolaystok/ks-context';

/**
 * "Diğer" — the manager's less frequent screens, kept off the bottom bar so
 * it stays at five big tabs: suppliers, the order email, Excel upload and
 * settings.
 */
export default function KolayStokMore() {
  const { t } = useI18n();
  const ks = useKs();
  const items: Array<{ href: string; key: TranslationKey; icon: typeof Truck; show: boolean }> = [
    { href: '/kolaystok/app/suppliers', key: 'ks.nav.suppliers', icon: Truck, show: ks.permissions.suppliers },
    { href: '/kolaystok/app/orders', key: 'ks.order.prepare', icon: Mail, show: ks.permissions.orderEmail },
    { href: '/kolaystok/app/quotes/new', key: 'ks.quote.prepare', icon: FileText, show: ks.permissions.quotes },
    { href: '/kolaystok/app/quotes', key: 'ks.quote.list', icon: Files, show: ks.permissions.quotes },
    { href: '/kolaystok/app/import', key: 'ks.imp.title', icon: FileSpreadsheet, show: ks.permissions.products },
    { href: '/kolaystok/app/settings', key: 'ks.nav.settings', icon: Settings, show: ks.permissions.settings },
  ];
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{t('ks.nav.more')}</h1>
      <ul className="space-y-2">
        {items
          .filter((i) => i.show)
          .map((i) => {
            const Icon = i.icon;
            return (
              <li key={i.href}>
                <Link href={i.href} className="flex h-16 items-center gap-4 rounded-xl bg-white px-4 text-lg font-semibold shadow-sm active:bg-slate-50">
                  <Icon className="h-7 w-7 text-teal-700" aria-hidden="true" />
                  <span className="flex-1">{t(i.key)}</span>
                  <ChevronRight className="h-6 w-6 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
