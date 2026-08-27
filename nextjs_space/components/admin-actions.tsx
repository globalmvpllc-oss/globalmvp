'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { readErrorMessage, NETWORK_ERROR_MESSAGE } from '@/lib/api-feedback';
import { MEMBER_ROLES } from '@/lib/admin/member-rules';

const NO_GRANT = '__none__';

/**
 * The write controls on the admin detail pages.
 *
 * Client components so the interaction lives in the browser, but every one posts
 * to a server route that re-checks admin authorisation and audits the change —
 * the button being visible is never what authorises the action. On success the
 * server component is re-rendered with router.refresh(), so the page always
 * reflects what was actually stored.
 */

/** Activate or deactivate a user, behind a confirmation. */
export function UserActiveToggle({
  userId,
  isActive,
  isSelf,
}: {
  userId: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const next = !isActive;

  const apply = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      });
      if (!res.ok) {
        toast.error(await readErrorMessage(res));
        return;
      }
      toast.success(next ? 'User activated.' : 'User deactivated.');
      setOpen(false);
      router.refresh();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {isActive ? 'Active' : 'Inactive'}
        </span>
        <Button
          variant={isActive ? 'outline' : 'default'}
          size="sm"
          disabled={isSelf && isActive}
          onClick={() => setOpen(true)}
        >
          {isActive ? 'Deactivate' : 'Activate'}
        </Button>
        {isSelf && isActive ? (
          <span className="text-xs text-muted-foreground">You cannot deactivate yourself.</span>
        ) : null}
      </div>

      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{next ? 'Activate this user?' : 'Deactivate this user?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {next
                ? 'The user will be able to sign in again.'
                : 'The user will be signed out of the application and refused sign-in until reactivated. Their data is kept.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                apply();
              }}
              className={next ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
            >
              {busy ? 'Saving…' : next ? 'Activate' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Change a membership's role or remove it, both behind server-side guards. */
export function MemberActions({ memberId, role }: { memberId: string; role: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const changeRole = async (nextRole: string) => {
    if (nextRole === role) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!res.ok) {
        toast.error(await readErrorMessage(res));
        return;
      }
      toast.success('Role updated.');
      router.refresh();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/members/${memberId}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await readErrorMessage(res));
        return;
      }
      toast.success('Member removed.');
      setConfirmRemove(false);
      router.refresh();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={changeRole} disabled={busy}>
        <SelectTrigger className="h-8 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEMBER_ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={busy}
        onClick={() => setConfirmRemove(true)}
      >
        Remove
      </Button>

      <AlertDialog open={confirmRemove} onOpenChange={(o) => !busy && setConfirmRemove(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the person&apos;s access to the company. The user account itself is not
              deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Set or clear a company's admin-granted plan. Polar always overrides a grant. */
export function GrantedPlanForm({
  companyId,
  grantedPlan,
  grantedPlanReason,
  grantedPlanUntil,
}: {
  companyId: string;
  grantedPlan: string | null;
  grantedPlanReason: string | null;
  /** 'YYYY-MM-DD' or empty. */
  grantedPlanUntil: string | null;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(grantedPlan ?? NO_GRANT);
  const [reason, setReason] = useState(grantedPlanReason ?? '');
  const [until, setUntil] = useState(grantedPlanUntil ?? '');
  const [busy, setBusy] = useState(false);
  const clearing = plan === NO_GRANT;

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/companies/${companyId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clearing ? { plan: null } : { plan, reason, until: until || null }),
      });
      if (!res.ok) {
        toast.error(await readErrorMessage(res));
        return;
      }
      toast.success(clearing ? 'Granted plan cleared.' : 'Granted plan saved.');
      router.refresh();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Plan</Label>
          <Select value={plan} onValueChange={setPlan} disabled={busy}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GRANT}>No grant</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="business">Business</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Expires (optional)</Label>
          <Input
            type="date"
            value={until}
            onChange={(e: any) => setUntil(e.target.value)}
            disabled={busy || clearing}
            className="h-9"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Reason</Label>
        <Input
          value={reason}
          onChange={(e: any) => setReason(e.target.value)}
          placeholder="founder, beta, support…"
          disabled={busy || clearing}
          className="h-9"
        />
      </div>
      <Button size="sm" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : clearing ? 'Clear granted plan' : 'Save granted plan'}
      </Button>
      <p className="text-xs text-muted-foreground">
        A real Polar subscription always overrides a grant. Plan and status stay owned by Polar.
      </p>
    </div>
  );
}

/** Send the standard hashed, single-use reset link to a user by email. */
export function PasswordResetButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' });
      if (!res.ok) {
        toast.error(await readErrorMessage(res));
        return;
      }
      toast.success('A password reset link has been sent to the user.');
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={send} disabled={busy}>
      {busy ? 'Sending…' : 'Send password reset'}
    </Button>
  );
}
