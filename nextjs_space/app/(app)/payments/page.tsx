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
import { Plus, CreditCard, ArrowDownLeft, ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { readErrorMessage } from '@/lib/api-feedback';
import { formatCurrency } from '@/lib/currencies';
import { toast } from 'sonner';
import { toCalendarInput, formatCalendarDate } from '@/lib/calendar-date';
import { PAYMENT_METHODS, paymentMethodLabelKey } from '@/lib/validation';
import { useI18n } from '@/components/i18n-provider';

export default function PaymentsPage() {
  const { t, fill, locale, intl } = useI18n();
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', currency: 'USD', paymentDate: '', paymentMethod: 'bank_transfer', invoiceId: '', reference: '', notes: '' });
  /** Null while recording a new payment; the payment id while correcting one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { setForm((p: any) => ({ ...p, paymentDate: new Date().toISOString().split('T')[0] })); }, []);

  const fetchData = async () => {
    const [payRes, invRes] = await Promise.all([
      fetch('/api/payments'), fetch('/api/invoices?status=SENT'),
    ]);
    setPayments(await payRes.json().then((d: any) => Array.isArray(d) ? d : []));
    const invData = await invRes.json();
    setInvoices(Array.isArray(invData) ? invData : []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () =>
    setForm({
      amount: '', currency: 'USD', paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'bank_transfer', invoiceId: '', reference: '', notes: '',
    });

  const openCreate = () => { setEditingId(null); resetForm(); setOpen(true); };

  /** Seeds the dialog from an existing payment so it can be corrected. */
  const openEdit = (p: any) => {
    setEditingId(p?.id ?? null);
    setForm({
      amount: String(p?.amount ?? ''),
      currency: p?.currency ?? 'USD',
      paymentDate: p?.paymentDate ? toCalendarInput(p.paymentDate) : '',
      paymentMethod: p?.paymentMethod ?? 'bank_transfer',
      invoiceId: p?.invoiceId ?? '',
      reference: p?.reference ?? '',
      notes: p?.notes ?? '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.amount) { toast.error(t('payments.amountRequired')); return; }
    if (Number(form.amount) <= 0) { toast.error(t('payments.amountPositive')); return; }
    // The link is fixed once a payment exists: the API does not allow moving a
    // payment between invoices, because both sides would need recalculating.
    if (!editingId && !form.invoiceId) { toast.error(t('payments.selectInvoice')); return; }

    setSaving(true);
    try {
      // Currency follows the invoice: the API requires them to match, so it is
      // never chosen independently.
      const selected = invoices.find((inv: any) => inv?.id === form.invoiceId);
      const currency = selected?.currency ?? form.currency;

      const payload: Record<string, unknown> = {
        amount: Number(form.amount),
        currency,
        paymentDate: form.paymentDate,
        paymentMethod: form.paymentMethod,
        reference: form.reference,
        notes: form.notes,
      };
      if (!editingId) payload.invoiceId = form.invoiceId;

      const res = await fetch(editingId ? `/api/payments/${editingId}` : '/api/payments', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Never claim success on a rejected payment: the invoice balance the
        // user is looking at would then disagree with the database.
        toast.error(await readErrorMessage(res, locale));
        return;
      }

      toast.success(editingId ? t('payments.updated') : t('payments.recorded'));
      setOpen(false);
      setEditingId(null);
      resetForm();
      await fetchData();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete?.id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/payments/${confirmDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error(await readErrorMessage(res, locale));
        return;
      }
      toast.success(t('payments.deleted'));
      setConfirmDelete(null);
      await fetchData();
    } catch {
      toast.error(t('error.network'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* The action drops below the heading rather than beside it on a narrow
          screen, where there is no room for both. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">{t('nav.payments')}</h1>
          <p className="text-muted-foreground">{t('payments.subtitle')}</p>
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> {t('invoices.recordPayment')}</Button>
      </div>

      <Dialog open={open} onOpenChange={(next: boolean) => { if (saving) return; setOpen(next); if (!next) setEditingId(null); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? t('payments.editTitle') : t('invoices.recordPayment')}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('common.amount')} *</Label><Input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('common.currency')}</Label>
                  <Input
                    readOnly
                    value={invoices.find((inv: any) => inv?.id === form.invoiceId)?.currency ?? form.currency ?? '—'}
                    placeholder={t('payments.selectInvoiceShort')}
                    className="bg-muted"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>{t('common.date')}</Label><Input type="date" value={form.paymentDate} onChange={(e: any) => setForm({ ...form, paymentDate: e.target.value })} /></div>
                <div className="space-y-1"><Label>{t('common.paymentMethod')}</Label>
                  <Select value={form.paymentMethod} onValueChange={(v: string) => setForm({ ...form, paymentMethod: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    {/* The stored code is the option value; only the label
                        follows the language. */}
                    <SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{t(paymentMethodLabelKey(method))}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label>{t('payments.linkToInvoice')}</Label>
                <Select value={form.invoiceId} onValueChange={(v: string) => setForm({ ...form, invoiceId: v })} disabled={Boolean(editingId)}>
                  <SelectTrigger><SelectValue placeholder={t('payments.selectInvoiceShort')} /></SelectTrigger>
                  <SelectContent>{invoices.map((inv: any) => <SelectItem key={inv?.id} value={inv?.id ?? ''}>{inv?.invoiceNumber ?? ''} - {inv?.customer?.name ?? ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{t('common.reference')}</Label><Input placeholder={t('invoices.referencePlaceholder')} value={form.reference} onChange={(e: any) => setForm({ ...form, reference: e.target.value })} /></div>
              <div className="space-y-1"><Label>{t('common.notes')}</Label><Textarea placeholder={t('common.notes')} value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} /></div>
              {editingId ? (
                <p className="text-xs text-muted-foreground">{t('payments.cannotMove')}</p>
              ) : null}
              <Button onClick={handleSave} className="w-full" disabled={saving}>
                {saving ? t('common.saving') : editingId ? t('common.saveChanges') : t('invoices.recordPayment')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

      {loading ? <div className="h-32 bg-muted rounded-lg animate-pulse" /> : (payments?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-12 text-center"><CreditCard className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">{t('payments.empty')}</h3><p className="text-sm text-muted-foreground">{t('payments.emptyHint')}</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {payments.map((p: any) => (
            <Card key={p?.id}>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-lg bg-green-50 flex items-center justify-center">
                      {p?.invoiceId ? <ArrowDownLeft className="w-5 h-5 text-green-600" /> : <ArrowUpRight className="w-5 h-5 text-red-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {p?.invoice
                          ? fill('payments.forInvoice', { number: p.invoice?.invoiceNumber ?? '' })
                          : p?.expense
                            ? fill('payments.forExpense', { description: p.expense?.description ?? '' })
                            : t('payments.one')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p?.invoice?.customer?.name ?? ''}
                        {p?.reference ? ` • ${t('common.reference')}: ${p.reference}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                    <div className="text-right">
                      <p className="font-mono font-medium text-green-600">{formatCurrency(p?.amount ?? 0, p?.currency ?? 'USD')}</p>
                      <p className="text-xs text-muted-foreground">{p?.paymentDate ? formatCalendarDate(p.paymentDate, 'MMM d, yyyy', intl) : ''}</p>
                    </div>
                    <Badge variant="outline">{t(paymentMethodLabelKey(p?.paymentMethod))}</Badge>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button" variant="ghost" size="icon"
                        aria-label={t('payments.editAria')}
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button" variant="ghost" size="icon"
                        aria-label={t('payments.deleteAria')}
                        onClick={() => setConfirmDelete(p)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <AlertDialog open={Boolean(confirmDelete)} onOpenChange={(o: boolean) => { if (!o && !deleting) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('payments.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.invoice?.invoiceNumber
                ? fill('payments.deleteBodyInvoice', { number: confirmDelete.invoice.invoiceNumber })
                : t('payments.deleteBody')}
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
