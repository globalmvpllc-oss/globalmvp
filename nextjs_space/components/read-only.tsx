'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { Eye, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/components/i18n-provider';
import { ACTIVE_COMPANY_COOKIE } from '@/lib/active-company';

/**
 * Read-only mode for an accountant (mali müşavir).
 *
 * The app layout decides it on the server from the active membership and
 * passes it down. Screens use it to hide buttons that would only be refused:
 * the server refuses every change from an accountant anyway, this just keeps
 * the screen honest about what can be done.
 */
const ReadOnlyContext = createContext(false);

export function ReadOnlyProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return <ReadOnlyContext.Provider value={value}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/** Renders its children only for members who can make changes. */
export function CanEdit({ children }: { children: ReactNode }) {
  return useReadOnly() ? null : <>{children}</>;
}

/**
 * The strip at the top of every screen for an accountant: what they can do
 * (read) and the one thing they can change (leave this company).
 */
export function AccountantBanner({ companyId, companyName }: { companyId: string; companyName: string }) {
  const { t, fill, locale } = useI18n();
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    if (!window.confirm(fill('acc.leaveConfirm', { company: companyName }))) return;
    setLeaving(true);
    try {
      const res = await fetch('/api/accountant/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        toast.error(t('acc.leaveFailed'));
        return;
      }
      // The stored choice named the company just left; drop it so the next
      // page lands on whatever access remains.
      document.cookie = `${ACTIVE_COMPANY_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
      toast.success(t('acc.left'));
      window.location.href = '/dashboard';
    } catch {
      toast.error(t('acc.leaveFailed'));
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div
      role="status"
      lang={locale}
      className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-center gap-2 text-lg font-semibold text-amber-900">
        <Eye className="h-5 w-5 shrink-0" aria-hidden="true" />
        {t('acc.banner')}
      </p>
      <Button variant="outline" onClick={leave} disabled={leaving} className="w-full sm:w-auto">
        <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
        {t('acc.leave')}
      </Button>
    </div>
  );
}
