'use client';

import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/i18n-provider';
import { writeActiveCompanyCookie } from '@/lib/active-company';

export interface SwitchableCompany {
  id: string;
  name: string;
  logoUrl: string | null;
  role: string;
}

/**
 * Switches between the companies a user belongs to.
 *
 * Rendered only when there are at least two — a user with one company sees the
 * plain header they always saw, with no new control. The caller decides that,
 * because it is the one holding the list.
 *
 * Switching writes the cookie and calls `router.refresh()`, the same pair the
 * language selector uses. The refresh is not cosmetic: every server component
 * on the page was rendered against the previous company, so without it the
 * dashboard would go on showing the old company's figures under the new
 * company's name.
 *
 * The cookie is only a preference. `requireUserCompany` re-checks membership on
 * every request, so nothing here grants access to anything — the worst a
 * tampered value can do is be ignored.
 */
export function CompanySwitcher({
  companies,
  activeCompanyId,
  collapsed,
}: {
  companies: SwitchableCompany[];
  activeCompanyId: string | null;
  collapsed: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();

  const active = companies.find((c) => c.id === activeCompanyId) ?? companies[0];

  const switchTo = (companyId: string) => {
    if (companyId === active?.id) return;
    writeActiveCompanyCookie(companyId);
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('company.switchCompany')}
          className={cn(
            'flex items-center gap-1 rounded-lg text-left transition-colors hover:bg-accent',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            collapsed ? 'p-1' : 'min-w-0 flex-1 px-1 py-1'
          )}
        >
          {!collapsed && (
            <span className="truncate text-lg font-display font-bold tracking-tight" title={active?.name}>
              {active?.name}
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t('company.yourCompanies')}
        </DropdownMenuLabel>

        {companies.map((company) => (
          <DropdownMenuItem
            key={company.id}
            onSelect={() => switchTo(company.id)}
            className="gap-2"
          >
            <Check
              className={cn('h-4 w-4 shrink-0', company.id === active?.id ? 'opacity-100' : 'opacity-0')}
              aria-hidden="true"
            />
            <span className="truncate" title={company.name}>{company.name}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/*
          A plain link rather than a form: onboarding already collects everything
          a company needs, and `add=1` is what tells it not to bounce a user who
          already has one straight back to the dashboard.
        */}
        <DropdownMenuItem onSelect={() => router.push('/onboarding?add=1')} className="gap-2">
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t('company.addCompany')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
