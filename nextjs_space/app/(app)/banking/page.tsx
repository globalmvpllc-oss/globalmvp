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
import { useI18n } from '@/components/i18n-provider';
import { fillTranslation, type TranslationKey } from '@/lib/i18n';
import { formatCalendarDate } from '@/lib/calendar-date';
import { readErrorMessage } from '@/lib/api-feedback';
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
    match: {
      label: string;
      labelKey?: string | null;
      labelValues?: Record<string, string>;
      href: string;
    } | null;
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
  const { t, fill, locale, intl } = useI18n();

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
      setLoadError(t('banking.loadAccountsFailed'));
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
    if (!form.bankName.trim()) { toast.error(t('banking.bankNameRequired')); return; }
    if (!form.accountName.trim()) { toast.error(t('banking.accountNameRequired')); return; }
    if (form.lastBalance !== '' && !Number.isFinite(Number(form.lastBalance))) {
      toast.error(t('banking.balanceMustBeNumber'));
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
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }

      toast.success(editingId ? t('banking.accountUpdated') : t('banking.accountAdded'));
      setOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await fetchAll();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bank-accounts/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      const body = await res.json().catch(() => ({}));
      const removed = Number(body?.deletedTransactions ?? 0);
      toast.success(
        removed > 0
          ? fill('banking.accountDeletedWithRows', { count: removed })
          : t('banking.accountDeleted')
      );
      setConfirmDelete(null);
      await fetchAll();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setDeleting(false);
    }
  };

  /**
   * The label for a matched record.
   *
   * The API sends both the English sentence it composed and the key behind it;
   * a row whose label is the user's own description carries no key and is shown
   * exactly as it was typed.
   */
  const matchLabel = (match: { label: string; labelKey?: string | null; labelValues?: Record<string, string> }) =>
    match.labelKey
      ? fillTranslation(locale, match.labelKey as TranslationKey, match.labelValues ?? {})
      : match.label;

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
          <h1 className="text-2xl font-display font-bold tracking-tight">{t('nav.banking')}</h1>
          <p className="text-muted-foreground">{t('banking.subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/banking/reconcile">
              {t('banking.reconcile')}
              {unreconciled > 0 ? (
                <Badge variant="secondary" className="ml-2">{unreconciled}</Badge>
              ) : null}
            </Link>
          </Button>
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" /> {t('banking.addAccount')}
          </Button>
        </div>
      </div>

      {loadError ? (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => { setLoading(true); fetchAll(); }}>{t('common.tryAgain')}</Button>
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
                  {t('banking.cashPosition')} · {position.currency}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-mono font-semibold tracking-tight">
                  {formatCurrency(position.total, position.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fill('banking.accountCount', { count: position.accounts })}
                  {/* Never presented as zero: "we do not know" and "it is empty"
                      are different answers, and only one is safe to show. */}
                  {position.accountsWithoutBalance > 0
                    ? ` · ${fill('banking.withoutBalance', { count: position.accountsWithoutBalance })}`
                    : ''}
                </p>
                {summary!.netMovementByCurrency?.[position.currency] ? (
                  <p className="text-xs text-muted-foreground">
                    {fill('banking.netMovement', {
                      amount: formatCurrency(summary!.netMovementByCurrency[position.currency], position.currency),
                      days: summary!.movementDays,
                    })}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t('banking.reconciliation')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-mono font-semibold tracking-tight">
                {summary?.reconciliationRate ?? 100}%
              </p>
              <p className="text-xs text-muted-foreground">
                {fill('banking.stillToReview', {
                  count: unreconciled,
                  total: summary?.counts?.total ?? 0,
                })}
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
            <h3 className="font-medium mb-1">{t('banking.noAccounts')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('banking.noAccountsHint')}</p>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> {t('banking.addAccount')}</Button>
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
                    <Button variant="ghost" size="icon" aria-label={t('banking.editAccount')} onClick={() => openEdit(account)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={t('banking.deleteAccount')} onClick={() => setConfirmDelete(account)}>
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
                        ? fill('banking.reportedOn', { date: formatCalendarDate(account.lastBalanceAt, 'MMM d, yyyy', intl) })
                        : t('banking.noBalanceYet')}
                    </p>
                  </div>
                  <div className="text-right">
                    {account.unreconciledCount > 0 ? (
                      <Link
                        href={`/banking/reconcile?account=${account.id}`}
                        className="text-sm font-medium text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {fill('dashboard.bankToReconcile', { count: account.unreconciledCount })}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t('dashboard.bankAllReconciled')}</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {account.lastSyncedAt
                        ? fill('banking.lastImport', { date: formatCalendarDate(account.lastSyncedAt, 'MMM d, yyyy', intl) })
                        : t('banking.neverImported')}
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
            <CardTitle className="text-base">{t('banking.recentActivity')}</CardTitle>
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
                      {formatCalendarDate(row.date, 'MMM d, yyyy', intl)}
                      {row.bankAccount ? ` · ${row.bankAccount.accountName}` : ''}
                      {row.match ? ` · ${matchLabel(row.match)}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono text-sm ${row.direction === 'CREDIT' ? 'text-green-600' : ''}`}>
                    {row.direction === 'DEBIT' ? '−' : '+'}
                    {formatCurrency(row.amount, row.currency)}
                  </span>
                  {row.effectiveStatus === 'MATCHED' ? (
                    <Badge variant="outline">{t('banking.matched')}</Badge>
                  ) : row.effectiveStatus === 'IGNORED' ? (
                    <Badge variant="secondary">{t('banking.ignored')}</Badge>
                  ) : (
                    <Badge>{t('banking.unmatched')}</Badge>
                  )}
                </div>
              </div>
            ))}
            <div className="pt-2">
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/banking/reconcile">{t('banking.openReconciliation')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* --- Account dialog -------------------------------------------------- */}
      <Dialog open={open} onOpenChange={(next: boolean) => { if (saving) return; setOpen(next); if (!next) setEditingId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t('banking.editAccountTitle') : t('banking.addAccountTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('banking.bankName')} *</Label>
                <Input value={form.bankName} placeholder={t('banking.bankNamePlaceholder')} onChange={(e: any) => setForm({ ...form, bankName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('banking.accountName')} *</Label>
                <Input value={form.accountName} placeholder={t('banking.accountNamePlaceholder')} onChange={(e: any) => setForm({ ...form, accountName: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('common.currency')}</Label>
                {editingId ? (
                  <>
                    <Input readOnly value={form.currency} className="bg-muted" />
                    <p className="text-xs text-muted-foreground">
                      {t('banking.currencyLocked')}
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
                <Label>{t('banking.accountNumber')}</Label>
                <Input
                  value={form.accountNumber}
                  placeholder={t('banking.accountNumberPlaceholder')}
                  onChange={(e: any) => setForm({ ...form, accountNumber: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  {t('banking.accountNumberHint')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>IBAN</Label>
                <Input value={form.iban} onChange={(e: any) => setForm({ ...form, iban: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('banking.reportedBalance')}</Label>
                <Input
                  type="number" step="0.01" placeholder="0.00"
                  value={form.lastBalance}
                  onChange={(e: any) => setForm({ ...form, lastBalance: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t('common.notes')}</Label>
              <Textarea value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? t('common.saving') : editingId ? t('common.saveChanges') : t('banking.addAccount')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o: boolean) => { if (!o && !deleting) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('banking.deleteAccountTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {fill('banking.deleteAccountBody', {
                name: confirmDelete?.accountName ?? t('banking.thisAccount'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
