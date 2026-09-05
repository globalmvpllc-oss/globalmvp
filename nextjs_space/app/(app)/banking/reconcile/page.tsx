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
import { formatCalendarDate, todayCalendarInput } from '@/lib/calendar-date';
import { readErrorMessage, NETWORK_ERROR_MESSAGE } from '@/lib/api-feedback';
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
  match: { type: string; id: string; label: string; href: string } | null;
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
  reasons: string[];
}

interface Account {
  id: string;
  bankName: string;
  accountName: string;
  currency: string;
  isActive: boolean;
}

const STATUS_FILTERS = [
  { value: 'UNMATCHED', label: 'To reconcile' },
  { value: 'MATCHED', label: 'Matched' },
  { value: 'IGNORED', label: 'Ignored' },
  { value: 'ALL', label: 'All' },
];

const TYPE_LABELS: Record<string, string> = {
  INVOICE: 'Invoice',
  PAYMENT: 'Payment',
  INCOME: 'Income',
  EXPENSE: 'Expense',
};

const PAGE_SIZE = 50;

function ReconcileWorkspace() {
  const searchParams = useSearchParams();

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
      setLoadError('Could not load bank transactions. Please try again.');
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
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      const data = await res.json();
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
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
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success(`Matched to ${suggestion.label}.`);
      setMatching(null);
      await fetchTransactions();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setLinking(null);
    }
  };

  const unmatch = async (transaction: Transaction) => {
    try {
      const res = await fetch(`/api/bank-transactions/${transaction.id}/match`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success('Match removed.');
      await fetchTransactions();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    }
  };

  const setStatus = async (transaction: Transaction, status: 'IGNORED' | 'UNMATCHED') => {
    try {
      const res = await fetch(`/api/bank-transactions/${transaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success(status === 'IGNORED' ? 'Transaction ignored.' : 'Transaction returned to the queue.');
      await fetchTransactions();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
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
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      const data = await res.json();
      const matched = Number(data?.matched ?? 0);
      const considered = Number(data?.considered ?? 0);
      // "0 of 34" is a result, not a failure — say so rather than showing an
      // error for a matcher that correctly declined to guess.
      toast.success(
        matched > 0
          ? `Matched ${matched} of ${considered} transactions.`
          : `Nothing could be matched with confidence (${considered} reviewed). The rest need a decision.`
      );
      await fetchTransactions();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setAutoMatching(false);
    }
  };

  const handleImport = async () => {
    if (!importAccount) { toast.error('Select a bank account.'); return; }
    if (!importCsv.trim()) { toast.error('Paste the statement first.'); return; }

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
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }

      const data = await res.json();
      const imported = Number(data?.imported ?? 0);
      const duplicates = Number(data?.duplicates ?? 0);
      const autoMatched = Number(data?.autoMatched ?? 0);
      setImportErrors(Array.isArray(data?.errors) ? data.errors : []);

      if (imported === 0 && duplicates === 0) {
        toast.error('Nothing could be imported. See the details below.');
      } else {
        const parts = [`Imported ${imported} transaction${imported === 1 ? '' : 's'}`];
        if (duplicates > 0) parts.push(`${duplicates} already present`);
        if (autoMatched > 0) parts.push(`${autoMatched} matched automatically`);
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
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setImporting(false);
    }
  };

  const handleCreateEntry = async () => {
    if (!entry.bankAccountId) { toast.error('Select a bank account.'); return; }
    if (!entry.description.trim()) { toast.error('Description is required.'); return; }
    if (!entry.amount || Number(entry.amount) <= 0) { toast.error('Amount must be greater than zero.'); return; }

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
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success('Transaction added.');
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
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setSavingEntry(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bank-transactions/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success('Transaction deleted.');
      setConfirmDelete(null);
      await fetchTransactions();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
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
          <h1 className="text-2xl font-display font-bold tracking-tight">Reconciliation</h1>
          <p className="text-muted-foreground">
            Match bank transactions to your invoices, payments, income and expenses
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href="/banking"><Landmark className="w-4 h-4 mr-2" /> Accounts</Link>
          </Button>
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={autoMatching || activeAccounts.length === 0}
            onClick={runAutoMatch}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {autoMatching ? 'Matching…' : 'Auto-match'}
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
            <Upload className="w-4 h-4 mr-2" /> Import
          </Button>
        </div>
      </div>

      {activeAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Landmark className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">No bank accounts yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add an account before importing a statement.
            </p>
            <Button asChild><Link href="/banking">Add a bank account</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* --- Filters ---------------------------------------------------- */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Account</Label>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All accounts</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.accountName} · {a.bankName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:self-end sm:pb-0.5">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => {
                setEntry((p) => ({ ...p, bankAccountId: accountFilter !== 'ALL' ? accountFilter : activeAccounts[0]?.id ?? '' }));
                setEntryOpen(true);
              }}>
                <Plus className="w-4 h-4 mr-2" /> Add manually
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
                <Button variant="outline" onClick={() => { setLoading(true); fetchTransactions(); }}>Try again</Button>
              </CardContent>
            </Card>
          ) : transactions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Landmark className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
                <h3 className="font-medium mb-1">
                  {statusFilter === 'UNMATCHED' ? 'Everything is reconciled' : 'No transactions here'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {statusFilter === 'UNMATCHED'
                    ? 'Nothing is waiting for a decision on this account.'
                    : 'Import a statement, or change the filters above.'}
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
                            {formatCalendarDate(row.date)}
                            {row.bankAccount ? ` · ${row.bankAccount.accountName}` : ''}
                            {row.reference ? ` · Ref: ${row.reference}` : ''}
                          </p>
                          {row.match ? (
                            <p className="text-xs mt-1">
                              <Link href={row.match.href} className="text-primary hover:underline inline-flex items-center gap-1">
                                {row.match.label}
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                              {row.matchConfidence !== null ? (
                                <span className="text-muted-foreground"> · matched automatically ({row.matchConfidence}%)</span>
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
                              Bal. {formatCurrency(row.balance, row.currency)}
                            </p>
                          ) : null}
                        </div>

                        {row.effectiveStatus === 'MATCHED' ? (
                          <Button variant="ghost" size="sm" onClick={() => unmatch(row)}>
                            <Link2Off className="w-4 h-4 mr-1" /> Unmatch
                          </Button>
                        ) : row.effectiveStatus === 'IGNORED' ? (
                          <Button variant="ghost" size="sm" onClick={() => setStatus(row, 'UNMATCHED')}>
                            Restore
                          </Button>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" onClick={() => openMatch(row)}>
                              <Link2 className="w-4 h-4 mr-1" /> Match
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setStatus(row, 'IGNORED')}>
                              <EyeOff className="w-4 h-4 mr-1" /> Ignore
                            </Button>
                          </>
                        )}

                        <Button
                          variant="ghost" size="icon"
                          aria-label="Delete transaction"
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
                    Page {page + 1} of {pageCount} · {total} transactions
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(p - 1, 0))}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
                      Next
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
          <DialogHeader><DialogTitle>Match this transaction</DialogTitle></DialogHeader>
          {matching ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium">{matching.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCalendarDate(matching.date)} ·{' '}
                  {matching.direction === 'CREDIT' ? 'Money in' : 'Money out'} ·{' '}
                  <span className="font-mono">{formatCurrency(matching.amount, matching.currency)}</span>
                </p>
              </div>

              {suggestionsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
                </div>
              ) : suggestions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm font-medium mb-1">No matching record found</p>
                  <p className="text-xs text-muted-foreground">
                    Nothing in the same currency, direction and amount falls within 60 days of this
                    line. Record the invoice, payment, income or expense first, or set this line aside
                    with Ignore if it needs no counterpart.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {suggestions.map((s) => (
                    <div key={`${s.type}-${s.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{TYPE_LABELS[s.type] ?? s.type}</Badge>
                          <p className="text-sm font-medium truncate">{s.label}</p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {s.sublabel ? `${s.sublabel} · ` : ''}
                          {formatCalendarDate(s.date)} ·{' '}
                          <span className="font-mono">{formatCurrency(s.amount, s.currency)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{s.reasons.join(' · ')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{s.score}%</Badge>
                        <Button size="sm" disabled={Boolean(linking)} onClick={() => applyMatch(s)}>
                          {linking === s.id ? 'Matching…' : 'Match'}
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
          <DialogHeader><DialogTitle>Import a statement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Bank account *</Label>
              <Select value={importAccount} onValueChange={setImportAccount}>
                <SelectTrigger><SelectValue placeholder="Select an account" /></SelectTrigger>
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
              <Label>Statement (CSV) *</Label>
              <Textarea
                rows={8}
                className="font-mono text-xs"
                placeholder={'Date,Description,Amount,Reference\n2026-09-01,Payment from Acme Ltd,1200.00,INV-2026-014\n2026-09-02,Office rent,-850.00,'}
                value={importCsv}
                onChange={(e: any) => setImportCsv(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Paste the rows from your bank export, including the header. Date, Description and
                Amount are needed; Debit/Credit columns, a Reference and a Balance are all understood
                too. Importing the same statement twice does not duplicate anything.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Closing balance</Label>
                <Input
                  type="number" step="0.01" placeholder="Optional"
                  value={importClosingBalance}
                  onChange={(e: any) => setImportClosingBalance(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Automatic matching</Label>
                <Select
                  value={importAutoMatch ? 'yes' : 'no'}
                  onValueChange={(v: string) => setImportAutoMatch(v === 'yes')}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Match obvious ones automatically</SelectItem>
                    <SelectItem value="no">Leave everything for me to review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {importErrors.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1 max-h-40 overflow-y-auto">
                <p className="text-xs font-medium">
                  {importErrors.length} row{importErrors.length === 1 ? ' was' : 's were'} not imported
                </p>
                {importErrors.slice(0, 25).map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground">Line {e.line}: {e.message}</p>
                ))}
                {importErrors.length > 25 ? (
                  <p className="text-xs text-muted-foreground">…and {importErrors.length - 25} more</p>
                ) : null}
              </div>
            ) : null}

            <Button onClick={handleImport} className="w-full" disabled={importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- Manual entry dialog ---------------------------------------------- */}
      <Dialog open={entryOpen} onOpenChange={(o: boolean) => { if (!savingEntry) setEntryOpen(o); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add a bank transaction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Bank account *</Label>
              <Select value={entry.bankAccountId} onValueChange={(v: string) => setEntry({ ...entry, bankAccountId: v })}>
                <SelectTrigger><SelectValue placeholder="Select an account" /></SelectTrigger>
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
                <Label>Date</Label>
                <Input type="date" value={entry.date} onChange={(e: any) => setEntry({ ...entry, date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Direction</Label>
                <Select value={entry.direction} onValueChange={(v: string) => setEntry({ ...entry, direction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CREDIT">Money in (credit)</SelectItem>
                    <SelectItem value="DEBIT">Money out (debit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Description *</Label>
              <Input value={entry.description} onChange={(e: any) => setEntry({ ...entry, description: e.target.value })} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Amount *</Label>
                <Input
                  type="number" step="0.01" placeholder="0.00"
                  value={entry.amount}
                  onChange={(e: any) => setEntry({ ...entry, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                {/* Follows the account: the API requires them to match, so it is
                    never chosen independently. */}
                <Input
                  readOnly
                  className="bg-muted"
                  placeholder="Select an account"
                  value={
                    accounts.find((a) => a.id === entry.bankAccountId)?.currency ??
                    CURRENCIES[0].code
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Reference</Label>
              <Input value={entry.reference} onChange={(e: any) => setEntry({ ...entry, reference: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={entry.notes} onChange={(e: any) => setEntry({ ...entry, notes: e.target.value })} />
            </div>

            <Button onClick={handleCreateEntry} className="w-full" disabled={savingEntry}>
              {savingEntry ? 'Saving…' : 'Add Transaction'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o: boolean) => { if (!o && !deleting) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this bank transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              Only the statement line is removed. Whatever it was matched to — an invoice, payment,
              income or expense — is left exactly as it is. This cannot be undone.
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
