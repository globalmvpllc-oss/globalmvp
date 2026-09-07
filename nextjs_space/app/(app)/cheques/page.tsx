'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Receipt, MoreVertical, Pencil, Trash2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, CURRENCIES } from '@/lib/currencies';
import { formatCalendarDate, toCalendarInput, todayCalendarInput } from '@/lib/calendar-date';
import { readErrorMessage } from '@/lib/api-feedback';
import { useI18n } from '@/components/i18n-provider';
import {
  CHEQUE_DIRECTIONS,
  CHEQUE_DIRECTION_LABEL_KEYS,
  CHEQUE_INSTRUMENTS,
  CHEQUE_INSTRUMENT_LABEL_KEYS,
  getChequeStatusBadge,
  isSettled,
  nextStatuses,
  statusesForDirection,
  type ChequeStatus,
} from '@/lib/cheque-status';
import type { ChequeTotals } from '@/lib/cheque-totals';

/**
 * Cheques and promissory notes — çek ve senet.
 *
 * Ordered by due date throughout, because the question a portfolio answers is
 * always "what is coming up".
 *
 * The totals at the top are what is *held* — face value of live instruments —
 * and they are deliberately captioned as promises rather than money. Nothing on
 * this page is income: an instrument only becomes money when it clears, and at
 * that point it produces a Payment and shows up in the ordinary totals like any
 * other payment.
 *
 * Recording a bounce is a first-class action in the row menu rather than an
 * edit of a status field, because karşılıksız is the case that costs a business
 * money and it should take one click to record.
 */

/** Radix Select cannot hold an empty string value. */
const NONE = '__none__';
const ALL = 'ALL';

const EMPTY_FORM = {
  direction: 'RECEIVED',
  instrument: 'CHEQUE',
  amount: '',
  currency: 'USD',
  issueDate: '',
  dueDate: '',
  bankName: '',
  chequeNumber: '',
  drawerName: '',
  notes: '',
  customerId: '',
  vendorId: '',
  invoiceId: '',
  expenseId: '',
};

type ChequeForm = typeof EMPTY_FORM;

export default function ChequesPage() {
  const { t, fill, locale, intl } = useI18n();

  const [rows, setRows] = useState<any[]>([]);
  const [totals, setTotals] = useState<ChequeTotals | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [directionFilter, setDirectionFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ChequeForm>(EMPTY_FORM);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  /**
   * The invoices or expenses this cheque could settle.
   *
   * Refetched whenever the choice changes, because the answer depends on all
   * of it: direction decides invoices or expenses, currency because the
   * settling path refuses a mismatch, and the party because a cheque from one
   * customer settling another customer's invoice is almost always a mistake.
   */
  const [linkable, setLinkable] = useState<any[]>([]);

  const update = (key: keyof ChequeForm, value: string) =>
    setForm((prev: ChequeForm) => {
      const next = { ...prev, [key]: value };

      /**
       * A link that no longer applies is cleared, never left behind.
       *
       * A received cheque cannot carry an expenseId, and an invoice chosen for
       * one customer is not the right invoice once the customer, currency or
       * direction changes. Leaving a stale id would send the server a link the
       * user can no longer see.
       */
      if (key === 'direction') {
        next.invoiceId = '';
        next.expenseId = '';
        if (value === 'RECEIVED') next.vendorId = '';
        else next.customerId = '';
      }
      if (key === 'currency' || key === 'customerId' || key === 'vendorId') {
        next.invoiceId = '';
        next.expenseId = '';
      }
      return next;
    });

  const fetchAll = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (directionFilter !== ALL) query.set('direction', directionFilter);
      if (statusFilter !== ALL) query.set('status', statusFilter);

      const [listRes, summaryRes] = await Promise.all([
        fetch(`/api/cheques?${query}`),
        fetch('/api/cheques/summary'),
      ]);

      if (!listRes.ok) {
        // An error body is truthy, so rendering it would draw an empty
        // portfolio and claim the drawer is empty when it is not.
        setRows([]);
        setLoadError(await readErrorMessage(listRes, locale));
        return;
      }
      setRows(await listRes.json());
      setTotals(summaryRes.ok ? await summaryRes.json() : null);
      setLoadError(null);
    } catch {
      setRows([]);
      setLoadError(t('error.network'));
    } finally {
      setLoading(false);
    }
  }, [directionFilter, statusFilter, locale, t]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Picklists, loaded once. They degrade to empty quietly: a missing customer
  // list must not stop somebody recording a cheque.
  useEffect(() => {
    fetch('/api/customers')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch('/api/vendors')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setVendors(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Loaded only while the dialog is open: a picker nobody is looking at is a
  // request nobody needs.
  useEffect(() => {
    if (!open) return;
    let active = true;

    const query = new URLSearchParams({ direction: form.direction, currency: form.currency });
    if (form.direction === 'RECEIVED' && form.customerId) query.set('customerId', form.customerId);
    if (form.direction === 'ISSUED' && form.vendorId) query.set('vendorId', form.vendorId);

    fetch(`/api/cheques/linkable?${query}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (active) setLinkable(Array.isArray(d) ? d : []); })
      // A picker that fails to load must not stop somebody recording a cheque;
      // the link is optional by design.
      .catch(() => { if (active) setLinkable([]); });

    return () => { active = false; };
  }, [open, form.direction, form.currency, form.customerId, form.vendorId]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, issueDate: todayCalendarInput(), dueDate: todayCalendarInput() });
    setOpen(true);
  };

  const openEdit = (row: any) => {
    setEditingId(row?.id ?? null);
    setForm({
      ...EMPTY_FORM,
      direction: row?.direction ?? 'RECEIVED',
      instrument: row?.instrument ?? 'CHEQUE',
      amount: String(row?.amount ?? ''),
      currency: row?.currency ?? 'USD',
      issueDate: row?.issueDate ? toCalendarInput(row.issueDate) : '',
      dueDate: row?.dueDate ? toCalendarInput(row.dueDate) : '',
      bankName: row?.bankName ?? '',
      chequeNumber: row?.chequeNumber ?? '',
      drawerName: row?.drawerName ?? '',
      notes: row?.notes ?? '',
      customerId: row?.customerId ?? '',
      vendorId: row?.vendorId ?? '',
      invoiceId: row?.invoiceId ?? '',
      expenseId: row?.expenseId ?? '',
    });
    setOpen(true);
  };

  /**
   * A note when the cheque does not match what the document owes.
   *
   * Deliberately a warning rather than a block. A customer paying a round
   * number against an odd balance, or one cheque covering part of a large
   * invoice, are both ordinary; refusing them would be wrong. Saying nothing at
   * all is what turns into a support question three weeks later.
   */
  const selectedDoc = linkable.find(
    (doc: any) => doc?.id === (form.direction === 'RECEIVED' ? form.invoiceId : form.expenseId)
  );
  const mismatch = (() => {
    if (!selectedDoc || !form.amount) return null;
    const amount = Number(form.amount);
    const outstanding = Number(selectedDoc.outstanding);
    if (!Number.isFinite(amount) || !Number.isFinite(outstanding) || amount === outstanding) {
      return null;
    }
    return fill(amount > outstanding ? 'cheques.amountOver' : 'cheques.amountUnder', {
      amount: formatCurrency(amount, form.currency),
      outstanding: formatCurrency(outstanding, form.currency),
    });
  })();

  const handleSave = async () => {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error(t('cheques.amountRequired'));
      return;
    }
    if (!form.dueDate) {
      toast.error(t('cheques.dueDateRequired'));
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        direction: form.direction,
        instrument: form.instrument,
        amount: Number(form.amount),
        currency: form.currency,
        dueDate: form.dueDate,
      };
      if (form.issueDate) payload.issueDate = form.issueDate;
      for (const key of ['bankName', 'chequeNumber', 'drawerName', 'notes'] as const) {
        if (form[key]) payload[key] = form[key];
      }
      // Only the link that matches the direction is ever sent. The server
      // checks it against this company before storing it either way.
      if (form.direction === 'RECEIVED') {
        if (form.customerId) payload.customerId = form.customerId;
        if (form.invoiceId) payload.invoiceId = form.invoiceId;
      } else {
        if (form.vendorId) payload.vendorId = form.vendorId;
        if (form.expenseId) payload.expenseId = form.expenseId;
      }

      const res = await fetch(editingId ? `/api/cheques/${editingId}` : '/api/cheques', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(await readErrorMessage(res, locale));
        return;
      }

      toast.success(editingId ? t('cheques.updated') : t('cheques.created'));
      setOpen(false);
      setEditingId(null);
      await fetchAll();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Moves an instrument to its next state.
   *
   * A settling move creates a Payment, so the amount is named and confirmed
   * first — the same rule the invoice "mark paid" action follows. A bounce
   * creates no money but is worth confirming too, because it is not something
   * to record by mis-clicking a menu.
   */
  const changeStatus = async (row: any, status: ChequeStatus) => {
    const amount = formatCurrency(row?.amount ?? 0, row?.currency ?? 'USD');
    if (status === 'CLEARED' && !window.confirm(fill('cheques.clearConfirm', { amount }))) return;
    if (status === 'PAID' && !window.confirm(fill('cheques.paidConfirm', { amount }))) return;
    if (status === 'BOUNCED' && !window.confirm(t('cheques.bouncedConfirm'))) return;

    setBusyId(row?.id ?? null);
    try {
      const res = await fetch(`/api/cheques/${row?.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        toast.error(await readErrorMessage(res, locale));
        return;
      }
      toast.success(
        fill('cheques.statusChanged', { status: t(getChequeStatusBadge(status).labelKey) })
      );
      await fetchAll();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete?.id) return;
    setBusyId(confirmDelete.id);
    try {
      const res = await fetch(`/api/cheques/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await readErrorMessage(res, locale));
        return;
      }
      toast.success(t('cheques.deleted'));
      setConfirmDelete(null);
      await fetchAll();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setBusyId(null);
    }
  };

  /** Statuses offered in the filter, narrowed once a direction is chosen. */
  const filterStatuses: ChequeStatus[] =
    directionFilter === ALL ? statusesForDirection(null) : statusesForDirection(directionFilter);

  const summaryCurrencies = totals?.currencies ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">{t('cheques.title')}</h1>
          <p className="text-muted-foreground">{t('cheques.subtitle')}</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> {t('cheques.add')}
        </Button>
      </div>

      {/* Totals — per currency, never summed across them. */}
      {summaryCurrencies.length > 0 ? (
        <div className="space-y-4">
          {summaryCurrencies.map((cur) => {
            const bucket = totals!.byCurrency[cur];
            return (
              <div key={cur}>
                {summaryCurrencies.length > 1 && (
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {cur}
                  </h3>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <p className="text-xs text-muted-foreground">{t('cheques.held')}</p>
                      <p className="text-lg font-mono font-bold">{formatCurrency(bucket.held, cur)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fill('cheques.instrumentCount', { count: bucket.heldCount })}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <p className="text-xs text-muted-foreground">{t('cheques.dueSoon')}</p>
                      <p className="text-lg font-mono font-bold text-amber-600">
                        {formatCurrency(bucket.dueSoon, cur)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fill('cheques.instrumentCount', { count: bucket.dueSoonCount })}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-5 pb-4">
                      <p className="text-xs text-muted-foreground">{t('cheques.bounced')}</p>
                      <p className="text-lg font-mono font-bold text-red-600">
                        {formatCurrency(bucket.bounced, cur)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fill('cheques.instrumentCount', { count: bucket.bouncedCount })}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
          {/* Said once, plainly: none of this is money yet. */}
          <p className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('cheques.notMoneyYet')}</span>
          </p>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">{t('cheques.direction')}</Label>
          <Select
            value={directionFilter}
            onValueChange={(v: string) => {
              setDirectionFilter(v);
              // A status only reachable by the other direction would return an
              // empty list with no way to tell why.
              setStatusFilter(ALL);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('cheques.allDirections')}</SelectItem>
              {CHEQUE_DIRECTIONS.map((value) => (
                <SelectItem key={value} value={value}>{t(CHEQUE_DIRECTION_LABEL_KEYS[value])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">{t('common.status')}</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {/* The option value is the stored status the API filters on. */}
              <SelectItem value={ALL}>{t('cheques.allStatuses')}</SelectItem>
              {filterStatuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(getChequeStatusBadge(value).labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i: number) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => { setLoading(true); fetchAll(); }}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="mx-auto mb-3 h-12 w-12 text-muted-foreground opacity-40" />
            {/* An empty filter result is not an empty drawer. */}
            <h3 className="mb-1 font-medium">
              {directionFilter !== ALL || statusFilter !== ALL
                ? t('cheques.emptyFiltered')
                : t('cheques.empty')}
            </h3>
            <p className="mb-4 text-sm text-muted-foreground">
              {directionFilter !== ALL || statusFilter !== ALL
                ? t('cheques.emptyFilteredHint')
                : t('cheques.emptyHint')}
            </p>
            {directionFilter === ALL && statusFilter === ALL ? (
              <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> {t('cheques.add')}</Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row: any) => {
            const badge = getChequeStatusBadge(row?.status);
            const moves = nextStatuses(row?.direction, row?.status);
            const party = row?.customer?.name ?? row?.vendor?.name ?? row?.drawerName ?? '';
            return (
              <Card key={row?.id}>
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                        <Receipt className="h-5 w-5 text-violet-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {t(CHEQUE_INSTRUMENT_LABEL_KEYS[
                            row?.instrument === 'PROMISSORY_NOTE' ? 'PROMISSORY_NOTE' : 'CHEQUE'
                          ])}
                          {row?.chequeNumber ? ` · ${row.chequeNumber}` : ''}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t(CHEQUE_DIRECTION_LABEL_KEYS[
                            row?.direction === 'ISSUED' ? 'ISSUED' : 'RECEIVED'
                          ])}
                          {party ? ` · ${party}` : ''}
                          {row?.bankName ? ` · ${row.bankName}` : ''}
                          {row?.invoice?.invoiceNumber ? ` · ${row.invoice.invoiceNumber}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                      <div className="text-right">
                        <p className="font-mono font-medium">
                          {formatCurrency(row?.amount ?? 0, row?.currency ?? 'USD')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('cheques.dueDate')}{' '}
                          {row?.dueDate ? formatCalendarDate(row.dueDate, 'MMM d, yyyy', intl) : ''}
                        </p>
                      </div>
                      <Badge className={badge.color}>{t(badge.labelKey)}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t('cheques.changeStatus')}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {/* Only the moves the lifecycle actually allows are
                              offered, so a terminal instrument shows none. */}
                          {moves.map((next) => (
                            <DropdownMenuItem
                              key={next}
                              disabled={busyId === row?.id}
                              className={next === 'BOUNCED' ? 'text-red-600' : undefined}
                              onClick={() => changeStatus(row, next)}
                            >
                              {t(getChequeStatusBadge(next).labelKey)}
                            </DropdownMenuItem>
                          ))}
                          {!isSettled(row?.status) ? (
                            <DropdownMenuItem onClick={() => openEdit(row)}>
                              <Pencil className="mr-2 h-4 w-4" /> {t('common.edit')}
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem className="text-red-600" onClick={() => setConfirmDelete(row)}>
                            <Trash2 className="mr-2 h-4 w-4" /> {t('common.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {row?.settledAt && row?.payment ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {fill('cheques.settledNote', {
                        date: formatCalendarDate(row.settledAt, 'MMM d, yyyy', intl),
                        amount: formatCurrency(row.payment.amount ?? 0, row?.currency ?? 'USD'),
                      })}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Dialog
        open={open}
        onOpenChange={(next: boolean) => {
          if (saving) return;
          setOpen(next);
          if (!next) setEditingId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t('cheques.editTitle') : t('cheques.addTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('cheques.direction')} *</Label>
                <Select value={form.direction} onValueChange={(v: string) => update('direction', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHEQUE_DIRECTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(CHEQUE_DIRECTION_LABEL_KEYS[value])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('cheques.instrument')}</Label>
                <Select value={form.instrument} onValueChange={(v: string) => update('instrument', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHEQUE_INSTRUMENTS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(CHEQUE_INSTRUMENT_LABEL_KEYS[value])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('common.amount')} *</Label>
                <Input
                  type="number" step="0.01" placeholder="0.00"
                  value={form.amount}
                  onChange={(e: any) => update('amount', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('common.currency')}</Label>
                <Select value={form.currency} onValueChange={(v: string) => update('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  {/* Currency codes are never translated. */}
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('cheques.issueDate')}</Label>
                <Input type="date" value={form.issueDate} onChange={(e: any) => update('issueDate', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('cheques.dueDate')} *</Label>
                <Input type="date" value={form.dueDate} onChange={(e: any) => update('dueDate', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('cheques.bankName')}</Label>
                <Input
                  placeholder={t('cheques.bankNamePlaceholder')}
                  value={form.bankName}
                  onChange={(e: any) => update('bankName', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('cheques.chequeNumber')}</Label>
                <Input
                  placeholder={t('cheques.chequeNumberPlaceholder')}
                  value={form.chequeNumber}
                  onChange={(e: any) => update('chequeNumber', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>{t('cheques.drawer')}</Label>
              <Input
                placeholder={t('cheques.drawerPlaceholder')}
                value={form.drawerName}
                onChange={(e: any) => update('drawerName', e.target.value)}
              />
            </div>

            {/* Only the party that matches the direction is offered. */}
            {form.direction === 'RECEIVED' ? (
              <div className="space-y-1">
                <Label>{t('cheques.customer')}</Label>
                <Select
                  value={form.customerId || NONE}
                  onValueChange={(v: string) => update('customerId', v === NONE ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder={t('common.none')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                    {customers.map((c: any) => (
                      <SelectItem key={c?.id} value={c?.id ?? ''}>{c?.name ?? ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>{t('cheques.vendor')}</Label>
                <Select
                  value={form.vendorId || NONE}
                  onValueChange={(v: string) => update('vendorId', v === NONE ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder={t('common.none')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('common.none')}</SelectItem>
                    {vendors.map((v: any) => (
                      <SelectItem key={v?.id} value={v?.id ?? ''}>{v?.name ?? ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Which document this settles. Optional in both directions: a
                cheque paying down a balance rather than one invoice is
                legitimate and must stay possible. */}
            <div className="space-y-1">
              <Label>
                {form.direction === 'RECEIVED' ? t('cheques.linkedInvoice') : t('cheques.linkedExpense')}
              </Label>
              <Select
                value={(form.direction === 'RECEIVED' ? form.invoiceId : form.expenseId) || NONE}
                onValueChange={(v: string) =>
                  update(form.direction === 'RECEIVED' ? 'invoiceId' : 'expenseId', v === NONE ? '' : v)
                }
              >
                <SelectTrigger><SelectValue placeholder={t('cheques.linkNone')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('cheques.linkNone')}</SelectItem>
                  {linkable.map((doc: any) => (
                    <SelectItem key={doc?.id} value={doc?.id ?? ''}>
                      {/* Enough to tell two documents apart: what it is, when
                          it is due, and how much of it is still owed. */}
                      {doc?.label}
                      {doc?.party ? ` · ${doc.party}` : ''}
                      {' · '}
                      {doc?.date ? formatCalendarDate(doc.date, 'MMM d, yyyy', intl) : ''}
                      {' · '}
                      {fill('cheques.outstandingOf', {
                        outstanding: formatCurrency(doc?.outstanding ?? 0, doc?.currency ?? form.currency),
                        total: formatCurrency(doc?.total ?? 0, doc?.currency ?? form.currency),
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkable.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('cheques.noLinkable')}</p>
              ) : null}
              {/* Warned, never blocked: over- and under-payment are both real. */}
              {mismatch ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">{mismatch}</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label>{t('common.notes')}</Label>
              <Textarea
                placeholder={t('common.notes')}
                value={form.notes}
                onChange={(e: any) => update('notes', e.target.value)}
              />
            </div>

            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? t('common.saving') : editingId ? t('common.saveChanges') : t('cheques.add')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o: boolean) => { if (!o && !busyId) setConfirmDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cheques.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('cheques.deleteBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(busyId)}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busyId ? t('common.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
