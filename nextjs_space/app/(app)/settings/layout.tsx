import { redirect } from 'next/navigation';
import { getActiveMembership } from '@/lib/auth-helpers';
import { isAccountant } from '@/lib/accountant/rules';

export const dynamic = 'force-dynamic';

/**
 * Settings and billing belong to the company, not to its accountant. An
 * accountant who opens /settings or /settings/billing is sent to the
 * dashboard; the APIs behind these screens refuse them too.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const membership = await getActiveMembership();
  if (membership && isAccountant(membership.role)) redirect('/dashboard');
  return <>{children}</>;
}
