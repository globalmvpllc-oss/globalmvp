'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, TrendingUp, CheckCircle, MoreVertical, Trash2, Pencil } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency, CURRENCIES } from '@/lib/currencies';
import { sumAmountsByCurrency } from '@/lib/payment-math';
import { toast } from 'sonner';
import { readErrorMessage } from '@/lib/api-feedback';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { personalizeEmptyState } from '@/lib/company-identity';
import { useCompany } from '@/hooks/use-company';
import { toCalendarInput, formatCalendarDate } from '@/lib/calendar-date';
import { useI18n } from '@/components/i18n-provider';

export default function IncomePage() {
  const { t, locale, intl, category: categoryLabel } = useI18n();
  const company = useCompany();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** Set when the income list itself could not be loaded, kept separate from the
   *  empty state so a 401/500 is not shown as "no income recorded". */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  /** Null while recording a new entry; the id while correcting one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Id awaiting delete confirmation. Removing a money record is irreversible. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Row with a request in flight, so its actions can be disabled. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ description: '', category: '', amount: '', currency: 'USD', date: '', expectedPaymentDate: '', customerId: '', status: 'EXPECTED', notes: '' });
  useEffect(() => { setForm((p: any) => ({ ...p, date: new Date().toISOString().split('T')[0] })); }, []);

  const fetchData = async () => {
    setLoadError(null);
    try {
      const [incRes, custRes, catRes] = await Promise.all([
        fetch('/api/income'), fetch('/api/customers'), fetch('/api/categories?type=income'),
      ]);
      // The income list is the page's primary data. A 401/403/500 here must not
      // fall through to an empty array and render as "no income recorded" — that
      // reads as lost data rather than a failed request.
      if (!incRes.ok) {
        setLoadError(await readErrorMessage(incRes, locale));
        setTransactions([]);
        return;
      }
      const inc = await incRes.json();
      setTransactions(Array.isArray(inc) ? inc : []);
      // Customers and categories are picklists; they degrade to empty quietly.
      setCustomers(await custRes.json().then((d: any) => Array.isArray(d) ? d : []).catch(() => []));
      setCategories(await catRes.json().then((d: any) => Array.isArray(d) ? d : []).catch(() => []));
    } catch {
      setLoadError(t('error.network'));
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const emptyForm = () => ({ description: '', category: '', amount: '', currency: 'USD', date: new Date().toISOString().split('T')[0], expectedPaymentDate: '', customerId: '', status: 'EXPECTED', notes: '' });

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setOpen(true); };

  /** Seeds the dialog from an existing record so it can be corrected. */
  const openEdit = (record: any) => {
    setEditingId(record?.id ?? null);
    setForm({
      ...emptyForm(),
      ...record,
      amount: String(record?.amount ?? ''),
      date: record?.date ? toCalendarInput(record.date) : '',
      expectedPaymentDate: record?.expectedPaymentDate ? toCalendarInput(record.expectedPaymentDate) : '',
      customerId: record?.customerId ?? '',
      notes: record?.notes ?? '',
      category: record?.category ?? '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.description.trim() || !form.amount) {
      toast.error(t('income.descriptionAmountRequired'));
      return;
    }
    if (Number(form.amount) <= 0) {
      toast.error(t('income.amountPositive'));
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form, amount: Number(form.amount) };
      if (editingId) payload.id = editingId;

      const res = await fetch('/api/income', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // The response was previously ignored on create, so a rejected entry
        // left the dialog open with no explanation at all.
        toast.error(await readErrorMessage(res, locale));
        return;
      }

      toast.success(editingId ? t('income.updated') : t('income.recorded'));
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      await fetchData();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSaving(false);
    }
  };

  const markReceived = async (id: string) => {
    // The response was ignored: a rejected update still reported success, so
    // the list and the database disagreed until the next reload.
    setBusyId(id);
    try {
      const res = await fetch('/api/income', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'RECEIVED' }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      toast.success(t('income.markedReceived'));
      await fetchData();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setBusyId(confirmDeleteId);
    try {
      const res = await fetch(`/api/income?id=${confirmDeleteId}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readErrorMessage(res, locale)); return; }
      toast.success(t('income.deleted'));
      setConfirmDeleteId(null);
      await fetchData();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setBusyId(null);
    }
  };

  // Prisma serialises Decimal columns to strings over JSON, so these must be
  // coerced before summing — plain `s + t.amount` concatenates and yields NaN.
  // Grouped by currency. Summing across currencies and labelling the result
  // with the first row's code produced a figure that was not money in any
  // currency — the dashboard and reports already group the same way.
  const expectedByCurrency = sumAmountsByCurrency(
    transactions.filter((row: any) => row?.status === 'EXPECTED'),
    (row: any) => row?.amount,
    (row: any) => row?.currency
  );
  const receivedByCurrency = sumAmountsByCurrency(
    transactions.filter((row: any) => row?.status === 'RECEIVED'),
    (row: any) => row?.amount,
    (row: any) => row?.currency
  );

  return (
    <div className="space-y-6">
      {/* The action drops below the heading rather than beside it on a narrow
          screen, where there is no room for both. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">{t('reports.income')}</h1>
          <p className="text-muted-foreground">{t('income.subtitle')}</p>
        </div>
        <Dialog open={open} onOpenChange={(next: boolean) => { if (saving) return; setOpen(next); if (!next) setEditingId(null); }}>
          <DialogTrigger asChild><Button onClick={openCreate} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> {t('income.add')}</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? t('income.editTitle') : t('income.add')}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>{t('common.description')} *</Label><Input placeholder={t('income.descriptionPlaceholder')} value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('common.amount')} *</Label><Input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('common.currency')}</Label>
                  <Select value={form.currency} onValueChange={(v: string) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    {/* Currency codes are never translated. */}
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('common.date')}</Label><Input type="date" value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('income.expectedPaymentDate')}</Label><Input type="date" value={form.expectedPaymentDate} onChange={(e: any) => setForm({ ...form, expectedPaymentDate: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('common.category')}</Label>
                  <Select value={form.category} onValueChange={(v: string) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                    {/* The option value stays the stored English category name;
                        only its label is translated. */}
                    <SelectContent>{categories.map((c: any) => <SelectItem key={c?.id} value={c?.name ?? ''}>{categoryLabel(c?.name)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>{t('common.customer')}</Label>
                  <Select value={form.customerId} onValueChange={(v: string) => setForm({ ...form, customerId: v })}>
                    <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
                    <SelectContent>{customers.map((c: any) => <SelectItem key={c?.id} value={c?.id ?? ''}>{c?.name ?? ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label>{t('common.status')}</Label>
                <Select value={form.status} onValueChange={(v: string) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  {/* EXPECTED / RECEIVED are stored values; the labels are not. */}
                  <SelectContent><SelectItem value="EXPECTED">{t('status.expected')}</SelectItem><SelectItem value="RECEIVED">{t('status.received')}</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{t('common.notes')}</Label><Textarea placeholder={t('common.notes')} value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleSave} className="w-full" disabled={saving}>{saving ? t('common.saving') : editingId ? t('common.saveChanges') : t('income.add')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-amber-600" /></div>
          <div><p className="text-xs text-muted-foreground">{t('status.expected')}</p>{expectedByCurrency.length === 0 ? (<p className="text-lg font-mono font-bold">{formatCurrency(0, company?.defaultCurrency ?? 'USD')}</p>) : expectedByCurrency.map((row: any) => (<p key={row.currency} className="text-lg font-mono font-bold">{formatCurrency(row.total, row.currency)}</p>))}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xs text-muted-foreground">{t('status.received')}</p>{receivedByCurrency.length === 0 ? (<p className="text-lg font-mono font-bold text-green-600">{formatCurrency(0, company?.defaultCurrency ?? 'USD')}</p>) : receivedByCurrency.map((row: any) => (<p key={row.currency} className="text-lg font-mono font-bold text-green-600">{formatCurrency(row.total, row.currency)}</p>))}</div>
        </CardContent></Card>
      </div>

      {/* List */}
      {loading ? <div className="h-32 bg-muted rounded-lg animate-pulse" /> : loadError ? (
        <Card><CardContent className="py-12 text-center"><TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">{t('income.loadFailed')}</h3><p className="text-sm text-muted-foreground mb-4">{loadError}</p><Button variant="outline" onClick={() => { setLoading(true); fetchData(); }}>{t('common.tryAgain')}</Button></CardContent></Card>
      ) : (transactions?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-12 text-center"><TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">{personalizeEmptyState(t('income.empty'), company?.name, t('common.emptyStateFor'))}</h3><p className="text-sm text-muted-foreground">{t('income.emptyHint')}</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {/* Named `row`, not `t`: `t` is the translator on this page. */}
          {transactions.map((row: any) => (
            <Card key={row?.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                {/* Amount, status and actions wrap onto their own line below
                    `sm` rather than crushing the description. */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={`w-2 h-2 shrink-0 rounded-full ${row?.status === 'RECEIVED' ? 'bg-green-500' : 'bg-amber-500'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{row?.description ?? ''}</p>
                      <p className="text-xs text-muted-foreground">{categoryLabel(row?.category)}{row?.customer?.name ? ` • ${row.customer.name}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                    <div className="text-right">
                      <p className="font-mono font-medium">{formatCurrency(row?.amount ?? 0, row?.currency ?? 'USD')}</p>
                      <p className="text-xs text-muted-foreground">{row?.date ? formatCalendarDate(row.date, 'MMM d, yyyy', intl) : ''}</p>
                    </div>
                    <Badge className={row?.status === 'RECEIVED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>{row?.status === 'RECEIVED' ? t('status.received') : t('status.expected')}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {row?.status === 'EXPECTED' && <DropdownMenuItem onClick={() => markReceived(row.id)} disabled={busyId === row.id}><CheckCircle className="w-4 h-4 mr-2" /> {t('income.markReceived')}</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => openEdit(row)}><Pencil className="w-4 h-4 mr-2" /> {t('common.edit')}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setConfirmDeleteId(row.id)} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" /> {t('common.delete')}</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <AlertDialog open={Boolean(confirmDeleteId)} onOpenChange={(o: boolean) => { if (!o && !busyId) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('income.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('income.deleteBody')}</AlertDialogDescription>
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
