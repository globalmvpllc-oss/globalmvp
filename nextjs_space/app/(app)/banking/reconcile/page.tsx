'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowDownLeft, ArrowUpRight, Landmark, Link2, Link2Off, EyeOff, Plus, Sparkles,
  Trash2, Upload, AlertCircle, ExternalLink,
} from 'lucide-react';
import { formatCurrency, CURRENCIES } from '@/lib/currencies';
import { useI18n } from '@/components/i18n-provider';
import { fillTranslation, type TranslationKey } from '@/lib/i18n';
import { formatCalendarDate, todayCalendarInput } from '@/lib/calendar-date';
import { readErrorMessage } from '@/lib/api-feedback';
import { toast } from 'sonner';

/**
 * The reconciliation workspace.
 *
 * One list of statement lines, with three things a person can do to each:
 * match it to a record, set it aside as needing none, or correct/delete it.
 *
 * The suggestion list is a convenience only — the API re-checks currency,
 * direction and amount before it will make any link, so nothing here can create
 * a pairing the matcher would have refused.
 */

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: string;
  currency: string;
  direction: 'CREDIT' | 'DEBIT';
  balance: string | null;
  reference: string | null;
  notes: string | null;
  status: string;
  effectiveStatus: 'MATCHED' | 'UNMATCHED' | 'IGNORED';
  matchConfidence: number | null;
  bankAccount: { id: string; bankName: string; accountName: string; currency: string } | null;
  match: {
    type: string;
    id: string;
    /** English sentence from the API; the fallback when no key is given. */
    label: string;
    labelKey?: string | null;
    labelValues?: Record<string, string>;
    href: string;
  } | null;
}

interface Suggestion {
  type: string;
  id: string;
  label: string;
  sublabel?: string;
  amount: number;
  currency: string;
  date: string;
  score: number;
  labelKey?: string | null;
  labelValues?: Record<string, string>;
  reasons: string[];
  /** The same reasons as keys, so they can be drawn in the reader's language. */
  reasonCodes?: Array<{ key: string; values?: Record<string, string> }>;
}

interface Account {
  id: string;
  bankName: string;
  accountName: string;
  currency: string;
  isActive: boolean;
}

/** The filter value is the stored status the API queries on; only the label
 *  follows the language. */
const STATUS_FILTERS = [
  { value: 'UNMATCHED', labelKey: 'banking.toReconcile' },
  { value: 'MATCHED', labelKey: 'banking.matched' },
  { value: 'IGNORED', labelKey: 'banking.ignored' },
  { value: 'ALL', labelKey: 'common.all' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: TranslationKey }>;

const TYPE_LABELS: Record<string, TranslationKey> = {
  INVOICE: 'common.invoice',
  PAYMENT: 'payments.one',
  INCOME: 'reports.income',
  EXPENSE: 'reports.expenses',
};

const PAGE_SIZE = 50;

function ReconcileWorkspace() {
  const { t, fill, locale, intl } = useI18n();
  const searchParams = useSearchParams();

  /**
   * A record's label in the reader's language.
   *
   * The API sends both the English sentence it composed and the key behind it.
   * A label that is the user's own text — an income or expense description —
   * carries no key and is shown exactly as it was typed.
   */
  const recordLabel = (item: {
    label: string;
    labelKey?: string | null;
    labelValues?: Record<string, string>;
  }) =>
    item.labelKey
      ? fillTranslation(locale, item.labelKey as TranslationKey, item.labelValues ?? {})
      : item.label;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState<string>(searchParams.get('account') ?? 'ALL');
  const [statusFilter, setStatusFilter] = useState<string>('UNMATCHED');
  const [page, setPage] = useState(0);

  // Match dialog
  const [matching, setMatching] = useState<Transaction | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importAccount, setImportAccount] = useState('');
  const [importCsv, setImportCsv] = useState('');
  const [importClosingBalance, setImportClosingBalance] = useState('');
  const [importAutoMatch, setImportAutoMatch] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<Array<{ line: number; message: string }>>([]);

  // Manual entry dialog
  const [entryOpen, setEntryOpen] = useState(false);
  const [entry, setEntry] = useState({
    bankAccountId: '',
    date: todayCalendarInput(),
    description: '',
    amount: '',
    direction: 'CREDIT',
    reference: '',
    notes: '',
  });
  const [savingEntry, setSavingEntry] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/bank-accounts');
      if (!res.ok) return;
      const data = await res.json();
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
    } catch {
      // The transaction list reports its own failure; a missing account picker
      // is a degraded filter, not a reason to blank the page.
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        take: String(PAGE_SIZE),
        skip: String(page * PAGE_SIZE),
      });
      if (accountFilter !== 'ALL') params.set('bankAccountId', accountFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await fetch(`/api/bank-transactions?${params.toString()}`);
      if (!res.ok) throw new Error('load');
      const data = await res.json();
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
      setTotal(Number(data?.total ?? 0));
      setLoadError(null);
    } catch {
      setLoadError(t('banking.loadTransactionsFailed'));
    } finally {
      setLoading(false);
    }
  }, [accountFilter, statusFilter, page]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  // Changing a filter must return to the first page, or a filter with fewer
  // results than the current offset renders an empty list that looks like "no
  // transactions" rather than "you are past the end".
  useEffect(() => { setPage(0); }, [accountFilter, statusFilter]);

  const openMatch = async (transaction: Transaction) => {
    setMatching(transaction);
    setSuggestions([]);
    setSuggestionsLoading(true);
    try {
      const res = await fetch(`/api/bank-transactions/${transaction.id}/match`);
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      const data = await res.json();
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const applyMatch = async (suggestion: Suggestion) => {
    if (!matching) return;
    setLinking(suggestion.id);
    try {
      const res = await fetch(`/api/bank-transactions/${matching.id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: suggestion.type, targetId: suggestion.id }),
      });
      // Never claim a reconciliation that the server refused: the books the user
      // is looking at would then disagree with the database.
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      toast.success(fill('banking.matchedTo', { label: recordLabel(suggestion) }));
      setMatching(null);
      await fetchTransactions();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setLinking(null);
    }
  };

  const unmatch = async (transaction: Transaction) => {
    try {
      const res = await fetch(`/api/bank-transactions/${transaction.id}/match`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      toast.success(t('banking.matchRemoved'));
      await fetchTransactions();
    } catch {
      toast.error(t('error.network'));
    }
  };

  const setStatus = async (transaction: Transaction, status: 'IGNORED' | 'UNMATCHED') => {
    try {
      const res = await fetch(`/api/bank-transactions/${transaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      toast.success(status === 'IGNORED' ? t('banking.transactionIgnored') : t('banking.transactionRestored'));
      await fetchTransactions();
    } catch {
      toast.error(t('error.network'));
    }
  };

  const runAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const res = await fetch('/api/bank-transactions/auto-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountFilter === 'ALL' ? {} : { bankAccountId: accountFilter }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      const data = await res.json();
      const matched = Number(data?.matched ?? 0);
      const considered = Number(data?.considered ?? 0);
      // "0 of 34" is a result, not a failure — say so rather than showing an
      // error for a matcher that correctly declined to guess.
      toast.success(
        matched > 0
          ? fill('banking.autoMatched', { matched, considered })
          : fill('banking.autoMatchedNone', { considered })
      );
      await fetchTransactions();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setAutoMatching(false);
    }
  };

  const handleImport = async () => {
    if (!importAccount) { toast.error(t('banking.selectAccount')); return; }
    if (!importCsv.trim()) { toast.error(t('banking.pasteStatement')); return; }

    setImporting(true);
    setImportErrors([]);
    try {
      const payload: Record<string, unknown> = {
        bankAccountId: importAccount,
        csv: importCsv,
        autoMatch: importAutoMatch,
      };
      if (importClosingBalance !== '' && Number.isFinite(Number(importClosingBalance))) {
        payload.closingBalance = Number(importClosingBalance);
      }

      const res = await fetch('/api/bank-transactions/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }

      const data = await res.json();
      const imported = Number(data?.imported ?? 0);
      const duplicates = Number(data?.duplicates ?? 0);
      const autoMatched = Number(data?.autoMatched ?? 0);
      setImportErrors(Array.isArray(data?.errors) ? data.errors : []);

      if (imported === 0 && duplicates === 0) {
        toast.error(t('banking.nothingImported'));
      } else {
        const parts = [fill('banking.importedCount', { count: imported })];
        if (duplicates > 0) parts.push(fill('banking.duplicatesCount', { count: duplicates }));
        if (autoMatched > 0) parts.push(fill('banking.autoMatchedCount', { count: autoMatched }));
        toast.success(`${parts.join(' · ')}.`);
        // The dialog stays open when rows were rejected, so the user can read
        // which lines were left out instead of the list closing over them.
        if (!Array.isArray(data?.errors) || data.errors.length === 0) {
          setImportOpen(false);
          setImportCsv('');
          setImportClosingBalance('');
        }
      }
      await Promise.all([fetchTransactions(), fetchAccounts()]);
    } catch {
      toast.error(t('error.network'));
    } finally {
      setImporting(false);
    }
  };

  const handleCreateEntry = async () => {
    if (!entry.bankAccountId) { toast.error(t('banking.selectAccount')); return; }
    if (!entry.description.trim()) { toast.error(t('banking.descriptionRequired')); return; }
    if (!entry.amount || Number(entry.amount) <= 0) { toast.error(t('income.amountPositive')); return; }

    setSavingEntry(true);
    try {
      const res = await fetch('/api/bank-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankAccountId: entry.bankAccountId,
          date: entry.date,
          description: entry.description.trim(),
          amount: Number(entry.amount),
          direction: entry.direction,
          reference: entry.reference.trim() || undefined,
          notes: entry.notes.trim() || undefined,
        }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      toast.success(t('banking.transactionAdded'));
      setEntryOpen(false);
      setEntry({
        bankAccountId: entry.bankAccountId,
        date: todayCalendarInput(),
        description: '',
        amount: '',
        direction: 'CREDIT',
        reference: '',
        notes: '',
      });
      await fetchTransactions();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bank-transactions/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      toast.success(t('banking.transactionDeleted'));
      setConfirmDelete(null);
      await fetchTransactions();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setDeleting(false);
    }
  };

  const activeAccounts = accounts.filter((a) => a.isActive);
  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">{t('banking.reconciliation')}</h1>
          <p className="text-muted-foreground">{t('banking.reconcileSubtitle')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/banking"><Landmark className="w-4 h-4 mr-2" /> {t('banking.accounts')}</Link>
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={autoMatching || activeAccounts.length === 0}
            onClick={runAutoMatch}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {autoMatching ? t('banking.matching') : t('banking.autoMatch')}
          </Button>
          <Button
            className="w-full sm:w-auto"
            disabled={activeAccounts.length === 0}
            onClick={() => {
              setImportAccount(activeAccounts[0]?.id ?? '');
              setImportErrors([]);
              setImportOpen(true);
            }}
          >
            <Upload className="w-4 h-4 mr-2" /> {t('banking.import')}
          </Button>
        </div>
      </div>

      {activeAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Landmark className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">{t('banking.noAccounts')}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('banking.addAccountFirst')}</p>
            <Button asChild><Link href="/banking">{t('banking.addAccount')}</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* --- Filters ---------------------------------------------------- */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">{t('banking.account')}</Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('banking.allAccounts')}</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.accountName} · {a.bankName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">{t('common.status')}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{t(f.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:self-end sm:pb-0.5">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => {
                setEntry((p) => ({ ...p, bankAccountId: accountFilter !== 'ALL' ? accountFilter : activeAccounts[0]?.id ?? '' }));
                setEntryOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" /> {t('banking.addManually')}
              </Button>
            </div>
          </div>

          {/* --- List ------------------------------------------------------- */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : loadError ? (
            <Card>
              <CardContent className="py-8 text-center space-y-3">
                <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{loadError}</p>
                <Button variant="outline" onClick={() => { setLoading(true); fetchTransactions(); }}>{t('common.tryAgain')}</Button>
              </CardContent>
            </Card>
          ) : transactions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Landmark className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <h3 className="font-medium mb-1">
                  {statusFilter === 'UNMATCHED' ? t('banking.allReconciledTitle') : t('banking.noTransactions')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {statusFilter === 'UNMATCHED'
                    ? t('banking.allReconciledHint')
                    : t('banking.noTransactionsHint')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {transactions.map((row) => (
                <Card key={row.id}>
                  <CardContent className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="w-10 h-10 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                          {row.direction === 'CREDIT'
                            ? <ArrowDownLeft className="w-5 h-5 text-green-600" />
                            : <ArrowUpRight className="w-5 h-5 text-red-500" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{row.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCalendarDate(row.date, 'MMM d, yyyy', intl)}
                            {row.bankAccount ? ` · ${row.bankAccount.accountName}` : ''}
                            {row.reference ? ` · ${t('common.reference')}: ${row.reference}` : ''}
                          </p>
                          {row.match ? (
                            <p className="text-xs mt-1">
                              <Link href={row.match.href} className="text-primary hover:underline inline-flex items-center gap-1">
                                {recordLabel(row.match)}
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                              {row.matchConfidence !== null ? (
                                <span className="text-muted-foreground"> · {fill('banking.matchedAutomatically', { score: row.matchConfidence })}</span>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                        <div className="text-right mr-1">
                          <p className={`font-mono font-medium ${row.direction === 'CREDIT' ? 'text-green-600' : ''}`}>
                            {row.direction === 'DEBIT' ? '−' : '+'}
                            {formatCurrency(row.amount, row.currency)}
                          </p>
                          {row.balance !== null ? (
                            <p className="text-xs text-muted-foreground font-mono">
                              {fill('banking.balanceShort', { amount: formatCurrency(row.balance, row.currency) })}
                            </p>
                          ) : null}
                        </div>

                        {row.effectiveStatus === 'MATCHED' ? (
                          <Button variant="ghost" size="sm" onClick={() => unmatch(row)}>
                            <Link2Off className="w-4 h-4 mr-1" /> {t('banking.unmatch')}
                          </Button>
                        ) : row.effectiveStatus === 'IGNORED' ? (
                          <Button variant="ghost" size="sm" onClick={() => setStatus(row, 'UNMATCHED')}>
                            {t('banking.restore')}
                          </Button>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openMatch(row)}>
                              <Link2 className="w-4 h-4 mr-1" /> {t('banking.match')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setStatus(row, 'IGNORED')}>
                              <EyeOff className="w-4 h-4 mr-1" /> {t('banking.ignore')}
                            </Button>
                          </>
                        )}

                        <Button
                          variant="ghost" size="icon"
                          aria-label={t('banking.deleteTransaction')}
                          onClick={() => setConfirmDelete(row)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {total > PAGE_SIZE ? (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    {fill('banking.pageOf', { page: page + 1, pages: pageCount, total })}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(p - 1, 0))}>
                      {t('banking.previous')}
                    </Button>
                    <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                      {t('banking.next')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      {/* --- Match dialog ---------------------------------------------------- */}
      <Dialog open={Boolean(matching)} onOpenChange={(o: boolean) => { if (!o && !linking) setMatching(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t('banking.matchTitle')}</DialogTitle></DialogHeader>
          {matching ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{matching.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCalendarDate(matching.date, 'MMM d, yyyy', intl)} ·{' '}
                  {matching.direction === 'CREDIT' ? t('banking.moneyIn') : t('banking.moneyOut')} ·{' '}
                  <span className="font-mono">{formatCurrency(matching.amount, matching.currency)}</span>
                </p>
              </div>

              {suggestionsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
                </div>
              ) : suggestions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-medium mb-1">{t('banking.noSuggestion')}</p>
                  <p className="text-xs text-muted-foreground">{t('banking.noSuggestionHint')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <div key={`${s.type}-${s.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{TYPE_LABELS[s.type] ? t(TYPE_LABELS[s.type]) : s.type}</Badge>
                          <p className="text-sm font-medium truncate">{recordLabel(s)}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {s.sublabel ? `${s.sublabel} · ` : ''}
                          {formatCalendarDate(s.date, 'MMM d, yyyy', intl)} ·{' '}
                          <span className="font-mono">{formatCurrency(s.amount, s.currency)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(s.reasonCodes ?? []).length > 0
                            ? s.reasonCodes!
                                .map((reason) =>
                                  fillTranslation(locale, reason.key as TranslationKey, reason.values ?? {})
                                )
                                .join(' · ')
                            : s.reasons.join(' · ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{s.score}%</Badge>
                        <Button size="sm" disabled={Boolean(linking)} onClick={() => applyMatch(s)}>
                          {linking === s.id ? t('banking.matching') : t('banking.match')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* --- Import dialog ---------------------------------------------------- */}
      <Dialog open={importOpen} onOpenChange={(o: boolean) => { if (!importing) setImportOpen(o); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t('banking.importTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('banking.bankAccount')} *</Label>
              <Select value={importAccount} onValueChange={setImportAccount}>
                <SelectTrigger><SelectValue placeholder={t('banking.selectAccountShort')} /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.accountName} · {a.bankName} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>{t('banking.statementCsv')} *</Label>
              <Textarea
                rows={8}
                className="font-mono text-xs"
                placeholder={'Date,Description,Amount,Reference\n2026-09-01,Payment from Acme Ltd,1200.00,INV-2026-014\n2026-09-02,Office rent,-850.00,'}
                value={importCsv}
                onChange={(e: any) => setImportCsv(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('banking.csvHint')}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('banking.closingBalance')}</Label>
                <Input
                  type="number" step="0.01" placeholder={t('common.optional')}
                  value={importClosingBalance}
                  onChange={(e: any) => setImportClosingBalance(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('banking.automaticMatching')}</Label>
                <Select
                  value={importAutoMatch ? 'yes' : 'no'}
                  onValueChange={(v: string) => setImportAutoMatch(v === 'yes')}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">{t('banking.autoMatchYes')}</SelectItem>
                    <SelectItem value="no">{t('banking.autoMatchNo')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {importErrors.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium">
                  {fill('banking.rowsNotImported', { count: importErrors.length })}
                </p>
                {importErrors.slice(0, 25).map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{fill('banking.lineNumber', { line: e.line })}: {e.message}</p>
                ))}
                {importErrors.length > 25 ? (
                  <p className="text-xs text-muted-foreground">{fill('banking.andMore', { count: importErrors.length - 25 })}</p>
                ) : null}
              </div>
            ) : null}

            <Button onClick={handleImport} className="w-full" disabled={importing}>
              {importing ? t('banking.importing') : t('banking.import')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- Manual entry dialog ---------------------------------------------- */}
      <Dialog open={entryOpen} onOpenChange={(o: boolean) => { if (!savingEntry) setEntryOpen(o); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('banking.addTransactionTitle')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t('banking.bankAccount')} *</Label>
              <Select value={entry.bankAccountId} onValueChange={(v: string) => setEntry({ ...entry, bankAccountId: v })}>
                <SelectTrigger><SelectValue placeholder={t('banking.selectAccountShort')} /></SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.accountName} · {a.bankName} ({a.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('common.date')}</Label>
                <Input type="date" value={entry.date} onChange={(e: any) => setEntry({ ...entry, date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('banking.direction')}</Label>
                <Select value={entry.direction} onValueChange={(v: string) => setEntry({ ...entry, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* CREDIT / DEBIT are stored values; the labels are not. */}
                    <SelectItem value="CREDIT">{t('banking.moneyInCredit')}</SelectItem>
                    <SelectItem value="DEBIT">{t('banking.moneyOutDebit')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t('common.description')} *</Label>
              <Input value={entry.description} onChange={(e: any) => setEntry({ ...entry, description: e.target.value })} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('common.amount')} *</Label>
                <Input
                  type="number" step="0.01" placeholder="0.00"
                  value={entry.amount}
                  onChange={(e: any) => setEntry({ ...entry, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('common.currency')}</Label>
                {/* Follows the account: the API requires them to match, so it is
                    never chosen independently. */}
                <Input
                  readOnly
                  className="bg-muted"
                  placeholder={t('banking.selectAccountShort')}
                  value={
                    accounts.find((a) => a.id === entry.bankAccountId)?.currency ??
                    CURRENCIES[0].code
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t('common.reference')}</Label>
              <Input value={entry.reference} onChange={(e: any) => setEntry({ ...entry, reference: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('common.notes')}</Label>
              <Textarea value={entry.notes} onChange={(e: any) => setEntry({ ...entry, notes: e.target.value })} />
            </div>

            <Button onClick={handleCreateEntry} className="w-full" disabled={savingEntry}>
              {savingEntry ? t('common.saving') : t('banking.addTransaction')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o: boolean) => { if (!o && !deleting) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('banking.deleteTransactionTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('banking.deleteTransactionBody')}</AlertDialogDescription>
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

/**
 * `useSearchParams` needs a Suspense boundary above it, or the whole route opts
 * out of static rendering with a build-time warning.
 */
export default function ReconcilePage() {
  return (
    <Suspense fallback={<div className="h-40 bg-muted rounded-lg animate-pulse" />}>
      <ReconcileWorkspace />
    </Suspense>
  );
}
