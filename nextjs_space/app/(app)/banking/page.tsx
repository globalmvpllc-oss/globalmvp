'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Landmark, Plus, Pencil, Trash2, ArrowDownLeft, ArrowUpRight, ArrowRight, AlertCircle,
} from 'lucide-react';
import { formatCurrency, CURRENCIES } from '@/lib/currencies';
import { formatCalendarDate } from '@/lib/calendar-date';
import { readErrorMessage, NETWORK_ERROR_MESSAGE } from '@/lib/api-feedback';
import { toast } from 'sonner';

/**
 * Banking overview.
 *
 * The cash position is shown per currency and never converted, matching how the
 * main dashboard and the reports already present multi-currency figures — there
 * is no exchange-rate source in this application, so a single combined number
 * would be invented.
 *
 * Balances are what each bank last reported, not a figure derived from imported
 * lines: a statement import is often partial, and a derived balance would be
 * confidently wrong. Accounts that have never reported one are called out rather
 * than counted as zero.
 */

interface Account {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string | null;
  iban: string | null;
  currency: string;
  provider: string;
  lastBalance: string | null;
  lastBalanceAt: string | null;
  lastSyncedAt: string | null;
  isActive: boolean;
  notes: string | null;
  unreconciledCount: number;
  canSync: boolean;
}

interface Summary {
  cashPosition: Array<{
    currency: string;
    total: string;
    accounts: number;
    accountsWithoutBalance: number;
  }>;
  counts: { total: number; matched: number; ignored: number; unmatched: number };
  reconciliationRate: number;
  netMovementByCurrency: Record<string, string>;
  movementDays: number;
  recent: Array<{
    id: string;
    date: string;
    description: string;
    amount: string;
    currency: string;
    direction: string;
    effectiveStatus: string;
    bankAccount: { bankName: string; accountName: string } | null;
    match: { label: string; href: string } | null;
  }>;
  hasAccounts: boolean;
}

const EMPTY_FORM = {
  bankName: '',
  accountName: '',
  accountNumber: '',
  iban: '',
  currency: 'USD',
  lastBalance: '',
  notes: '',
};

export default function BankingPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [accountsRes, summaryRes] = await Promise.all([
        fetch('/api/bank-accounts'),
        fetch('/api/banking/summary'),
      ]);
      // The status is checked rather than parsing whatever came back, so a
      // failed request can never be drawn as an empty business.
      if (!accountsRes.ok || !summaryRes.ok) throw new Error('load');
      const accountsData = await accountsRes.json();
      const summaryData = await summaryRes.json();
      setAccounts(Array.isArray(accountsData?.accounts) ? accountsData.accounts : []);
      setSummary(summaryData);
      setLoadError(null);
    } catch {
      setLoadError('Could not load your bank accounts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditingId(account.id);
    setForm({
      bankName: account.bankName ?? '',
      accountName: account.accountName ?? '',
      accountNumber: account.accountNumber ?? '',
      iban: account.iban ?? '',
      currency: account.currency ?? 'USD',
      lastBalance: account.lastBalance ?? '',
      notes: account.notes ?? '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.bankName.trim()) { toast.error('Bank name is required.'); return; }
    if (!form.accountName.trim()) { toast.error('Account name is required.'); return; }
    if (form.lastBalance !== '' && !Number.isFinite(Number(form.lastBalance))) {
      toast.error('Balance must be a number.');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        bankName: form.bankName.trim(),
        accountName: form.accountName.trim(),
        accountNumber: form.accountNumber.trim() || undefined,
        iban: form.iban.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (form.lastBalance !== '') payload.lastBalance = Number(form.lastBalance);
      // Currency is fixed once an account exists: changing it would leave every
      // stored line denominated in something the account no longer claims, and
      // the matcher would then silently reject all of them.
      if (!editingId) payload.currency = form.currency;

      const res = await fetch(editingId ? `/api/bank-accounts/${editingId}` : '/api/bank-accounts', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }

      toast.success(editingId ? 'Bank account updated.' : 'Bank account added.');
      setOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await fetchAll();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bank-accounts/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      const body = await res.json().catch(() => ({}));
      const removed = Number(body?.deletedTransactions ?? 0);
      toast.success(
        removed > 0
          ? `Bank account deleted, along with ${removed} imported transaction${removed === 1 ? '' : 's'}.`
          : 'Bank account deleted.'
      );
      setConfirmDelete(null);
      await fetchAll();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setDeleting(false);
    }
  };

  const unreconciled = summary?.counts?.unmatched ?? 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />)}
        </div>
        <div className="h-40 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">Banking</h1>
          <p className="text-muted-foreground">Bank accounts, balances and reconciliation</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/banking/reconcile">
              Reconcile
              {unreconciled > 0 ? (
                <Badge variant="secondary" className="ml-2">{unreconciled}</Badge>
              ) : null}
            </Link>
          </Button>
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" /> Add Account
          </Button>
        </div>
      </div>

      {loadError ? (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => { setLoading(true); fetchAll(); }}>Try again</Button>
          </CardContent>
        </Card>
      ) : null}

      {/* --- Cash position ------------------------------------------------- */}
      {!loadError && (summary?.cashPosition?.length ?? 0) > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary!.cashPosition.map((position) => (
            <Card key={position.currency}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Cash position · {position.currency}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-mono font-semibold tracking-tight">
                  {formatCurrency(position.total, position.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {position.accounts} account{position.accounts === 1 ? '' : 's'}
                  {/* Never presented as zero: "we do not know" and "it is empty"
                      are different answers, and only one is safe to show. */}
                  {position.accountsWithoutBalance > 0
                    ? ` · ${position.accountsWithoutBalance} with no reported balance`
                    : ''}
                </p>
                {summary!.netMovementByCurrency?.[position.currency] ? (
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(summary!.netMovementByCurrency[position.currency], position.currency)}
                    {' '}net over the last {summary!.movementDays} days
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Reconciliation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-mono font-semibold tracking-tight">
                {summary?.reconciliationRate ?? 100}%
              </p>
              <p className="text-xs text-muted-foreground">
                {unreconciled} of {summary?.counts?.total ?? 0} transaction
                {(summary?.counts?.total ?? 0) === 1 ? '' : 's'} still to review
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* --- Accounts ------------------------------------------------------- */}
      {!loadError && accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Landmark className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">No bank accounts yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add an account, then import a statement to start reconciling it against your invoices,
              payments, income and expenses.
            </p>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Account</Button>
          </CardContent>
        </Card>
      ) : null}

      {accounts.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.id} className={account.isActive ? undefined : 'opacity-60'}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Landmark className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{account.accountName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {account.bankName}
                        {account.accountNumber ? ` · ${account.accountNumber}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline">{account.currency}</Badge>
                    <Button variant="ghost" size="icon" aria-label="Edit account" onClick={() => openEdit(account)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete account" onClick={() => setConfirmDelete(account)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xl font-mono font-semibold">
                      {account.lastBalance === null
                        ? '—'
                        : formatCurrency(account.lastBalance, account.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {account.lastBalanceAt
                        ? `Reported ${formatCalendarDate(account.lastBalanceAt)}`
                        : 'No balance reported yet'}
                    </p>
                  </div>
                  <div className="text-right">
                    {account.unreconciledCount > 0 ? (
                      <Link
                        href={`/banking/reconcile?account=${account.id}`}
                        className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {account.unreconciledCount} to reconcile
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">All reconciled</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {account.lastSyncedAt
                        ? `Last import ${formatCalendarDate(account.lastSyncedAt)}`
                        : 'Never imported'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* --- Recent activity ------------------------------------------------ */}
      {(summary?.recent?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent bank activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {summary!.recent.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                    {row.direction === 'CREDIT'
                      ? <ArrowDownLeft className="w-4 h-4 text-green-600" />
                      : <ArrowUpRight className="w-4 h-4 text-red-500" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.description}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatCalendarDate(row.date)}
                      {row.bankAccount ? ` · ${row.bankAccount.accountName}` : ''}
                      {row.match ? ` · ${row.match.label}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-sm ${row.direction === 'CREDIT' ? 'text-green-600' : ''}`}>
                    {row.direction === 'DEBIT' ? '−' : '+'}
                    {formatCurrency(row.amount, row.currency)}
                  </span>
                  {row.effectiveStatus === 'MATCHED' ? (
                    <Badge variant="outline">Matched</Badge>
                  ) : row.effectiveStatus === 'IGNORED' ? (
                    <Badge variant="secondary">Ignored</Badge>
                  ) : (
                    <Badge>Unmatched</Badge>
                  )}
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/banking/reconcile">Open reconciliation</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* --- Account dialog -------------------------------------------------- */}
      <Dialog open={open} onOpenChange={(next: boolean) => { if (saving) return; setOpen(next); if (!next) setEditingId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Bank Account' : 'Add Bank Account'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Bank name *</Label>
                <Input value={form.bankName} placeholder="e.g. Chase" onChange={(e: any) => setForm({ ...form, bankName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Account name *</Label>
                <Input value={form.accountName} placeholder="e.g. Business Current" onChange={(e: any) => setForm({ ...form, accountName: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Currency</Label>
                {editingId ? (
                  <>
                    <Input readOnly value={form.currency} className="bg-muted" />
                    <p className="text-xs text-muted-foreground">
                      Currency cannot be changed once the account exists.
                    </p>
                  </>
                ) : (
                  <Select value={form.currency} onValueChange={(v: string) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1">
                <Label>Account number</Label>
                <Input
                  value={form.accountNumber}
                  placeholder="Last 4 digits"
                  onChange={(e: any) => setForm({ ...form, accountNumber: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  A masked form or the last four digits — the full number is not needed.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>IBAN</Label>
                <Input value={form.iban} onChange={(e: any) => setForm({ ...form, iban: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Balance reported by the bank</Label>
                <Input
                  type="number" step="0.01" placeholder="0.00"
                  value={form.lastBalance}
                  onChange={(e: any) => setForm({ ...form, lastBalance: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o: boolean) => { if (!o && !deleting) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              Every transaction imported into {confirmDelete?.accountName ?? 'this account'} is deleted
              with it. Your invoices, payments, income and expenses are not affected — only the bank
              statement lines and the links to them. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
