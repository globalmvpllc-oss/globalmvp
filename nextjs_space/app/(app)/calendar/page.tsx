'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, FileText, CreditCard, TrendingDown, TrendingUp, CalendarDays, Plus, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, CURRENCIES } from '@/lib/currencies';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  addMonths, subMonths, getDay,
} from 'date-fns';
import { toCalendarDay } from '@/lib/calendar-date';
import Link from 'next/link';

/**
 * Two kinds of entry share this calendar.
 *
 * `derived` entries are computed from invoices, expenses and payments at read
 * time. They are never written into the Event table: duplicating them would
 * give a due date two sources of truth that drift the moment one changes.
 *
 * `manual` entries are real Event rows and are the only ones editable here.
 */
type DerivedKind = 'invoice_due' | 'expense_due' | 'payment' | 'income';

interface CalendarEntry {
  key: string;
  origin: 'derived' | 'manual';
  kind: DerivedKind | 'manual';
  title: string;
  subtitle?: string;
  amount?: number | string | null;
  currency?: string | null;
  date: Date;
  timeLabel?: string;
  /**
   * Where this entry came from, when a detail page for it actually exists.
   * Only invoices have one today, so everything else stays unlinked rather
   * than pointing at a route that would 404.
   */
  href?: string;
  raw?: any;
}

/**
 * Invoice statuses that represent a due date the business is working towards.
 *
 * PAID is included so history survives: a settled invoice still had a due date,
 * and leaving it out meant the calendar emptied itself as invoices were paid.
 * DRAFT and CANCELLED are excluded — one was never issued, the other was
 * withdrawn, so neither has a date anyone is waiting on.
 */
const INVOICE_DUE_STATUSES: readonly string[] = [
  'SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE', 'PAID',
];

const EVENT_TYPES = ['MEETING', 'REMINDER', 'PAYMENT', 'INVOICE', 'EXPENSE', 'OTHER'] as const;
const EVENT_STATUSES = ['PLANNED', 'DONE', 'CANCELLED'] as const;

const EMPTY_FORM = {
  title: '', description: '', date: '', startTime: '', endTime: '', allDay: false,
  type: 'OTHER', status: 'PLANNED', amount: '', currency: '',
  customerId: '', invoiceId: '', reminderAt: '',
};

/** Radix Select cannot hold an empty string value, so "none" needs a sentinel. */
const NONE = '__none__';

function dotClass(entry: CalendarEntry): string {
  if (entry.origin === 'manual') return 'bg-primary';
  if (entry.kind === 'invoice_due') return 'bg-blue-500';
  if (entry.kind === 'expense_due') return 'bg-red-500';
  if (entry.kind === 'income') return 'bg-emerald-500';
  return 'bg-green-500';
}

function entryIcon(entry: CalendarEntry) {
  if (entry.origin === 'manual') return <CalendarDays className="w-4 h-4 text-primary" />;
  if (entry.kind === 'invoice_due') return <FileText className="w-4 h-4 text-blue-500" />;
  if (entry.kind === 'expense_due') return <TrendingDown className="w-4 h-4 text-red-500" />;
  if (entry.kind === 'income') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
  return <CreditCard className="w-4 h-4 text-green-500" />;
}

function entryLabel(entry: CalendarEntry): string {
  if (entry.origin === 'manual') return String(entry.raw?.type ?? 'OTHER').toLowerCase();
  return entry.kind.replace('_', ' ');
}

/** Splits an ISO timestamp into the date and time values the form inputs expect. */
function splitIso(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return { date: format(d, 'yyyy-MM-dd'), time: format(d, 'HH:mm') };
}

/** Combines a date input and an optional time input into an ISO string. */
function joinIso(date: string, time: string, allDay: boolean): string {
  if (!date) return '';
  if (allDay || !time) return new Date(`${date}T00:00:00`).toISOString();
  return new Date(`${date}T${time}`).toISOString();
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const [todayDate, setTodayDate] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [derived, setDerived] = useState<CalendarEntry[]>([]);
  const [manual, setManual] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);

  // Guards against a slow response for a month the user has already left
  // overwriting the data for the month they are now looking at.
  const requestRef = useRef(0);
  /** Same stale-response guard for the derived financial queries. */
  const derivedRef = useRef(0);

  useEffect(() => {
    const now = new Date();
    setCurrentMonth(now);
    setTodayDate(now);
  }, []);

  /**
   * Options for the manual-event form: which customer or invoice an event can
   * be linked to. These are a picklist, not calendar content, so they are
   * fetched once and are not month-scoped — you may well want to attach an
   * event to an invoice that is due in another month.
   */
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/customers').then((r: any) => (r.ok ? r.json() : [])),
      fetch('/api/invoices').then((r: any) => (r.ok ? r.json() : [])),
    ])
      .then(([cust, inv]: any) => {
        if (!active) return;
        setCustomers(cust ?? []);
        setInvoices(inv ?? []);
      })
      .catch(() => { /* the picklists degrade to empty; the calendar still works */ });
    return () => { active = false; };
  }, []);

  /**
   * Derived financial entries for the month on screen.
   *
   * Previously these three lists were fetched once, in full and unfiltered —
   * but `/api/invoices` and `/api/payments` return only the most recent 100
   * rows by default, so any business past that number silently lost its older
   * due dates from the calendar. Asking for the month explicitly means the API
   * returns that month whole.
   *
   * Refetches when the month changes, and `requestRef` discards a response that
   * arrives after the user has already moved on — the same guard loadEvents
   * uses.
   */
  const loadDerived = useCallback(async (month: Date) => {
    const token = ++derivedRef.current;
    // Formatted from the local month, so the window matches the month the user
    // is looking at. The server pins these to UTC midnight, which is how the
    // columns were written, so no offset creeps in either direction.
    const from = format(startOfMonth(month), 'yyyy-MM-dd');
    const to = format(startOfMonth(addMonths(month, 1)), 'yyyy-MM-dd');
    const range = `from=${from}&to=${to}`;

    try {
      // Each source is fetched for the same window. A source that fails
      // resolves to an empty list rather than rejecting, so one failing request
      // cannot blank the whole calendar; a total failure is still caught below
      // and surfaced as a real error state.
      const [inv, exp, pay, inc] = await Promise.all([
        fetch(`/api/invoices?${range}`).then((r: any) => (r.ok ? r.json() : [])),
        fetch(`/api/expenses?${range}`).then((r: any) => (r.ok ? r.json() : [])),
        fetch(`/api/payments?${range}`).then((r: any) => (r.ok ? r.json() : [])),
        fetch(`/api/income?${range}`).then((r: any) => (r.ok ? r.json() : [])),
      ]);
      if (token !== derivedRef.current) return;

      const entries: CalendarEntry[] = [];

      // PAID is included: a settled invoice still had a due date, and dropping
      // it made the calendar's history disappear as invoices were paid off.
      // CANCELLED and DRAFT stay out — one was withdrawn, the other was never
      // issued, so neither has a due date the business is working towards.
      for (const i of inv ?? []) {
        if (i?.dueDate && INVOICE_DUE_STATUSES.includes(i?.status)) {
          entries.push({
            key: `inv-${i.id}`, origin: 'derived', kind: 'invoice_due',
            title: `${i?.invoiceNumber ?? ''} — ${i?.customer?.name ?? ''}`.trim(),
            subtitle: i?.status === 'PAID' ? 'Paid' : undefined,
            amount: i?.total, currency: i?.currency ?? 'USD', date: toCalendarDay(i.dueDate)!,
            href: `/invoices/${i.id}`,
          });
        }
      }
      // `dueDate ?? date`, and no status filter. Restricting to UNPAID with a
      // due date hid two whole classes of record: expenses entered without a
      // due date never appeared at all, and an expense vanished from the
      // calendar the moment it was paid.
      for (const e of exp ?? []) {
        const when = toCalendarDay(e?.dueDate ?? e?.date);
        if (when) {
          entries.push({
            key: `exp-${e.id}`, origin: 'derived', kind: 'expense_due',
            title: e?.description ?? 'Expense',
            subtitle: e?.status === 'PAID' ? 'Paid' : 'Unpaid',
            amount: e?.amount, currency: e?.currency ?? 'USD', date: when,
          });
        }
      }
      // Money in and money out both arrive as Payment rows, so the title says
      // which. Both `invoice` and `expense` are already on the payload the
      // payments API returns, so this needs no extra query.
      for (const p of pay ?? []) {
        const when = toCalendarDay(p?.paymentDate);
        if (!when) continue;

        const invoiceNumber = p?.invoice?.invoiceNumber;
        const expenseDescription = p?.expense?.description;

        let title = 'Payment';
        if (invoiceNumber) title = `Invoice Payment — ${invoiceNumber}`;
        else if (expenseDescription) title = `Expense Payment — ${expenseDescription}`;

        entries.push({
          key: `pay-${p.id}`, origin: 'derived', kind: 'payment',
          title,
          subtitle: p?.invoice?.customer?.name ?? undefined,
          amount: p?.amount, currency: p?.currency ?? 'USD', date: when,
          // Only the invoice side has a detail page today.
          href: p?.invoiceId ? `/invoices/${p.invoiceId}` : undefined,
        });
      }

      // Income sits on the day the money is expected, falling back to the
      // transaction date — the same rule the API filters by, so a record is
      // never selected for one month and drawn in another.
      for (const t of inc ?? []) {
        const when = toCalendarDay(t?.expectedPaymentDate ?? t?.date);
        if (when) {
          entries.push({
            key: `inc-${t.id}`, origin: 'derived', kind: 'income',
            title: t?.description ?? 'Income',
            subtitle: t?.customer?.name ?? (t?.status === 'RECEIVED' ? 'Received' : 'Expected'),
            amount: t?.amount, currency: t?.currency ?? 'USD', date: when,
          });
        }
      }

      setDerived(entries);
    } catch {
      if (token === derivedRef.current) setLoadError('Could not load financial records');
    } finally {
      if (token === derivedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentMonth) loadDerived(currentMonth);
  }, [currentMonth, loadDerived]);

  /** Manual events, refetched whenever the visible month changes. */
  const loadEvents = useCallback(async (month: Date) => {
    const token = ++requestRef.current;
    const from = startOfMonth(month).toISOString();
    // Half-open window: the first instant of the following month.
    const to = startOfMonth(addMonths(month, 1)).toISOString();
    try {
      const res = await fetch(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (token !== requestRef.current) return; // a newer month is already in flight
      if (!res.ok) { setLoadError('Could not load events'); return; }
      setManual(await res.json());
      setLoadError(null);
    } catch {
      if (token === requestRef.current) setLoadError('Could not load events');
    }
  }, []);

  useEffect(() => {
    if (currentMonth) loadEvents(currentMonth);
  }, [currentMonth, loadEvents]);

  if (!currentMonth) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-96 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  const manualEntries: CalendarEntry[] = manual.map((e: any) => {
    const start = new Date(e.startAt);
    const end = e.endAt ? new Date(e.endAt) : null;
    return {
      key: `evt-${e.id}`,
      origin: 'manual' as const,
      kind: 'manual' as const,
      title: e.title,
      subtitle: e.description ?? undefined,
      amount: e.amount,
      currency: e.currency,
      date: start,
      timeLabel: e.allDay
        ? 'All day'
        : end ? `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}` : format(start, 'HH:mm'),
      raw: e,
    };
  });

  const allEntries = [...derived, ...manualEntries];
  const monthStart = startOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(currentMonth) });
  const startPadding = getDay(monthStart);

  const entriesFor = (day: Date) => allEntries.filter((e: CalendarEntry) => isSameDay(e.date, day));
  const selectedEntries = selectedDate ? entriesFor(selectedDate) : [];

  const openCreate = (day?: Date | null) => {
    const target = day ?? selectedDate ?? todayDate ?? new Date();
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: format(target, 'yyyy-MM-dd') });
    setDialogOpen(true);
  };

  const openEdit = (event: any) => {
    const start = splitIso(event?.startAt);
    const end = splitIso(event?.endAt);
    setEditingId(event?.id ?? null);
    setForm({
      title: event?.title ?? '',
      description: event?.description ?? '',
      date: start.date,
      startTime: event?.allDay ? '' : start.time,
      endTime: event?.allDay ? '' : end.time,
      allDay: Boolean(event?.allDay),
      type: event?.type ?? 'OTHER',
      status: event?.status ?? 'PLANNED',
      amount: event?.amount != null ? String(event.amount) : '',
      currency: event?.currency ?? '',
      customerId: event?.customerId ?? '',
      invoiceId: event?.invoiceId ?? '',
      reminderAt: event?.reminderAt ? splitIso(event.reminderAt).date : '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.date) { toast.error('Date is required'); return; }

    const startAt = joinIso(form.date, form.startTime, form.allDay);
    const endAt = form.allDay || !form.endTime ? '' : joinIso(form.date, form.endTime, false);
    if (endAt && new Date(endAt) < new Date(startAt)) {
      toast.error('End time cannot be before the start time');
      return;
    }

    const payload: any = {
      title: form.title.trim(),
      description: form.description || '',
      startAt,
      endAt,
      allDay: form.allDay,
      type: form.type,
      status: form.status,
      customerId: form.customerId || '',
      invoiceId: form.invoiceId || '',
      reminderAt: form.reminderAt ? new Date(`${form.reminderAt}T09:00:00`).toISOString() : '',
    };
    if (form.amount !== '') {
      const n = Number(form.amount);
      if (!Number.isFinite(n) || n < 0) { toast.error('Amount must be a positive number'); return; }
      payload.amount = n;
      if (form.currency) payload.currency = form.currency;
    }

    setSaving(true);
    try {
      const res = await fetch(editingId ? `/api/events/${editingId}` : '/api/events', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(editingId ? 'Event updated' : 'Event created');
        setDialogOpen(false);
        loadEvents(currentMonth);
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? 'Could not save the event');
      }
    } catch {
      toast.error('Could not save the event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${confirmDeleteId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Event deleted');
        setConfirmDeleteId(null);
        setDialogOpen(false);
        loadEvents(currentMonth);
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? 'Could not delete the event');
      }
    } catch {
      toast.error('Could not delete the event');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground">See your financial events at a glance</p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus className="w-4 h-4 mr-2" /> Add event
        </Button>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Previous month"
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Next month"
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <CardTitle className="text-base">{format(currentMonth, 'MMMM yyyy')}</CardTitle>
              <Button variant="outline" size="sm"
                onClick={() => { const n = todayDate ?? new Date(); setCurrentMonth(n); setSelectedDate(n); }}>
                Today
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d: string) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
              {Array.from({ length: startPadding }, (_: any, i: number) => (
                <div key={`pad-${i}`} className="p-1 min-h-[64px] sm:min-h-[84px]" />
              ))}
              {days.map((day: Date) => {
                const dayEntries = entriesFor(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isToday = todayDate ? isSameDay(day, todayDate) : false;
                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    onDoubleClick={() => openCreate(day)}
                    aria-label={`${format(day, 'MMMM d')}, ${dayEntries.length} entries`}
                    className={`p-1 sm:p-1.5 min-h-[64px] sm:min-h-[84px] border rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
                    } ${isToday && !isSelected ? 'bg-primary/5' : ''}`}
                  >
                    <span className={`text-sm ${isToday ? 'font-bold text-primary' : ''}`}>{format(day, 'd')}</span>
                    <div className="mt-1 space-y-0.5">
                      {dayEntries.slice(0, 2).map((e: CalendarEntry) => (
                        <div key={e.key} className="flex items-center gap-1">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(e)}`} />
                          <span className="truncate text-[10px] leading-tight text-muted-foreground">{e.title}</span>
                        </div>
                      ))}
                      {dayEntries.length > 2 && (
                        <p className="text-[10px] text-muted-foreground">+{dayEntries.length - 2} more</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                {selectedDate ? format(selectedDate, 'MMMM d, yyyy') : 'Select a day'}
              </CardTitle>
              {selectedDate ? (
                <Button variant="ghost" size="sm" aria-label="Add event on this day"
                  onClick={() => openCreate(selectedDate)}>
                  <Plus className="w-4 h-4" />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <div className="h-12 bg-muted rounded animate-pulse" />
                <div className="h-12 bg-muted rounded animate-pulse" />
              </div>
            ) : !selectedDate ? (
              <p className="text-sm text-muted-foreground text-center py-4">Click a day to see what is on it</p>
            ) : selectedEntries.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">Nothing scheduled for this day</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => openCreate(selectedDate)}>
                  <Plus className="w-4 h-4 mr-2" /> Add event
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedEntries.map((e: CalendarEntry) => (
                  <div key={e.key} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-muted/50">
                    {entryIcon(e)}
                    <div className="flex-1 min-w-0">
                      {/* Only entries with a detail page that actually exists
                          become links; income, expenses and expense payments
                          have no such route today, so they stay plain text
                          rather than pointing somewhere that would 404. */}
                      {e.href ? (
                        <Link href={e.href} className="text-sm font-medium truncate block hover:underline">
                          {e.title}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium truncate">{e.title}</p>
                      )}
                      <p className="text-xs text-muted-foreground capitalize">
                        {entryLabel(e)}{e.timeLabel ? ` - ${e.timeLabel}` : ''}
                      </p>
                      {e.subtitle ? (
                        <p className="text-xs text-muted-foreground truncate">{e.subtitle}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {e.amount != null && e.currency ? (
                        <p className="font-mono text-sm font-medium">{formatCurrency(e.amount as any, e.currency)}</p>
                      ) : null}
                      {e.origin === 'manual' ? (
                        <Button variant="ghost" size="icon-sm" aria-label="Edit event" onClick={() => openEdit(e.raw)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-sm text-muted-foreground">Invoice due</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-sm text-muted-foreground">Expense due</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-sm text-muted-foreground">Payment</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-primary" /><span className="text-sm text-muted-foreground">Your event</span></div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit event' : 'Add event'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update this calendar entry.' : 'Add something to your calendar.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="Client meeting" />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.allDay} onCheckedChange={(v: any) => setForm({ ...form, allDay: Boolean(v) })} />
                  All day
                </label>
              </div>
            </div>

            {!form.allDay && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Start time</Label>
                  <Input type="time" value={form.startTime} onChange={(e: any) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>End time</Label>
                  <Input type="time" value={form.endTime} onChange={(e: any) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v: string) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t: string) => <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v: string) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_STATUSES.map((t: string) => <SelectItem key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input type="number" min="0" step="0.01" value={form.amount}
                  onChange={(e: any) => setForm({ ...form, amount: e.target.value })} placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={form.currency || NONE}
                  onValueChange={(v: string) => setForm({ ...form, currency: v === NONE ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {CURRENCIES.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Customer</Label>
                <Select value={form.customerId || NONE}
                  onValueChange={(v: string) => setForm({ ...form, customerId: v === NONE ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {customers.map((c: any) => <SelectItem key={c?.id} value={c?.id ?? ''}>{c?.name ?? ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Invoice</Label>
                <Select value={form.invoiceId || NONE}
                  onValueChange={(v: string) => setForm({ ...form, invoiceId: v === NONE ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {invoices.map((i: any) => <SelectItem key={i?.id} value={i?.id ?? ''}>{i?.invoiceNumber ?? ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Reminder</Label>
              <Input type="date" value={form.reminderAt} onChange={(e: any) => setForm({ ...form, reminderAt: e.target.value })} />
              <p className="text-xs text-muted-foreground">Stored with the event. No notifications are sent yet.</p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {editingId ? (
              <Button variant="ghost" className="text-destructive hover:text-destructive"
                disabled={saving} onClick={() => setConfirmDeleteId(editingId)}>
                Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button disabled={saving} onClick={handleSave}>
                {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create event'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmDeleteId)} onOpenChange={(o: boolean) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the calendar entry permanently. Invoices, expenses and payments are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
