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
import { formatCurrency } from '@/lib/currencies';
import { sumAmounts, sumAmountsByCurrency } from '@/lib/payment-math';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { readErrorMessage, NETWORK_ERROR_MESSAGE } from '@/lib/api-feedback';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { personalizeEmptyState } from '@/lib/company-identity';
import { useCompany } from '@/hooks/use-company';
import { toCalendarInput } from '@/lib/calendar-date';

export default function IncomePage() {
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
        setLoadError(await readErrorMessage(incRes));
        setTransactions([]);
        return;
      }
      const inc = await incRes.json();
      setTransactions(Array.isArray(inc) ? inc : []);
      // Customers and categories are picklists; they degrade to empty quietly.
      setCustomers(await custRes.json().then((d: any) => Array.isArray(d) ? d : []).catch(() => []));
      setCategories(await catRes.json().then((d: any) => Array.isArray(d) ? d : []).catch(() => []));
    } catch {
      setLoadError(NETWORK_ERROR_MESSAGE);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const emptyForm = () => ({ description: '', category: '', amount: '', currency: 'USD', date: new Date().toISOString().split('T')[0], expectedPaymentDate: '', customerId: '', status: 'EXPECTED', notes: '' });

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setOpen(true); };

  /** Seeds the dialog from an existing record so it can be corrected. */
  const openEdit = (t: any) => {
    setEditingId(t?.id ?? null);
    setForm({
      ...emptyForm(),
      ...t,
      amount: String(t?.amount ?? ''),
      date: t?.date ? toCalendarInput(t.date) : '',
      expectedPaymentDate: t?.expectedPaymentDate ? toCalendarInput(t.expectedPaymentDate) : '',
      customerId: t?.customerId ?? '',
      notes: t?.notes ?? '',
      category: t?.category ?? '',
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.description.trim() || !form.amount) {
      toast.error('Description and amount are required.');
      return;
    }
    if (Number(form.amount) <= 0) {
      toast.error('Amount must be greater than zero.');
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
        toast.error(await readErrorMessage(res));
        return;
      }

      toast.success(editingId ? 'Income updated.' : 'Income recorded.');
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm());
      await fetchData();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
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
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success('Marked as received');
      await fetchData();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setBusyId(confirmDeleteId);
    try {
      const res = await fetch(`/api/income?id=${confirmDeleteId}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success('Deleted');
      setConfirmDeleteId(null);
      await fetchData();
    } catch {
      toast.error(NETWORK_ERROR_MESSAGE);
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
    transactions.filter((t: any) => t?.status === 'EXPECTED'),
    (t: any) => t?.amount,
    (t: any) => t?.currency
  );
  const receivedByCurrency = sumAmountsByCurrency(
    transactions.filter((t: any) => t?.status === 'RECEIVED'),
    (t: any) => t?.amount,
    (t: any) => t?.currency
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Income</h1>
          <p className="text-muted-foreground">Track your income and expected payments</p>
        </div>
        <Dialog open={open} onOpenChange={(next: boolean) => { if (saving) return; setOpen(next); if (!next) setEditingId(null); }}>
          <DialogTrigger asChild><Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Income</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editingId ? 'Edit Income' : 'Add Income'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Description *</Label><Input placeholder="What is this income for?" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Amount *</Label><Input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} /></div>
                <div className="space-y-1"><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v: string) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="GBP">GBP</SelectItem><SelectItem value="TRY">TRY</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })} /></div>
                <div className="space-y-1"><Label>Expected payment date</Label><Input type="date" value={form.expectedPaymentDate} onChange={(e: any) => setForm({ ...form, expectedPaymentDate: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Category</Label>
                  <Select value={form.category} onValueChange={(v: string) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{categories.map((c: any) => <SelectItem key={c?.id} value={c?.name ?? ''}>{c?.name ?? ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Customer</Label>
                  <Select value={form.customerId} onValueChange={(v: string) => setForm({ ...form, customerId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{customers.map((c: any) => <SelectItem key={c?.id} value={c?.id ?? ''}>{c?.name ?? ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v: string) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="EXPECTED">Expected</SelectItem><SelectItem value="RECEIVED">Received</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleSave} className="w-full" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Income'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-amber-600" /></div>
          <div><p className="text-xs text-muted-foreground">Expected</p>{expectedByCurrency.length === 0 ? (<p className="text-lg font-mono font-bold">{formatCurrency(0, company?.defaultCurrency ?? 'USD')}</p>) : expectedByCurrency.map((row: any) => (<p key={row.currency} className="text-lg font-mono font-bold">{formatCurrency(row.total, row.currency)}</p>))}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xs text-muted-foreground">Received</p>{receivedByCurrency.length === 0 ? (<p className="text-lg font-mono font-bold text-green-600">{formatCurrency(0, company?.defaultCurrency ?? 'USD')}</p>) : receivedByCurrency.map((row: any) => (<p key={row.currency} className="text-lg font-mono font-bold text-green-600">{formatCurrency(row.total, row.currency)}</p>))}</div>
        </CardContent></Card>
      </div>

      {/* List */}
      {loading ? <div className="h-32 bg-muted rounded-lg animate-pulse" /> : loadError ? (
        <Card><CardContent className="py-12 text-center"><TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">Could not load income</h3><p className="text-sm text-muted-foreground mb-4">{loadError}</p><Button variant="outline" onClick={() => { setLoading(true); fetchData(); }}>Try again</Button></CardContent></Card>
      ) : (transactions?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-12 text-center"><TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">{personalizeEmptyState('No income recorded', company?.name)}</h3><p className="text-sm text-muted-foreground">Start tracking your income</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {transactions.map((t: any) => (
            <Card key={t?.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${t?.status === 'RECEIVED' ? 'bg-green-500' : 'bg-amber-500'}`} />
                    <div>
                      <p className="text-sm font-medium">{t?.description ?? ''}</p>
                      <p className="text-xs text-muted-foreground">{t?.category ?? ''}{t?.customer?.name ? ` • ${t.customer.name}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono font-medium">{formatCurrency(t?.amount ?? 0, t?.currency ?? 'USD')}</p>
                      <p className="text-xs text-muted-foreground">{t?.date ? format(new Date(t.date), 'MMM d, yyyy') : ''}</p>
                    </div>
                    <Badge className={t?.status === 'RECEIVED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>{t?.status === 'RECEIVED' ? 'Received' : 'Expected'}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {t?.status === 'EXPECTED' && <DropdownMenuItem onClick={() => markReceived(t.id)} disabled={busyId === t.id}><CheckCircle className="w-4 h-4 mr-2" /> Mark received</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setConfirmDeleteId(t.id)} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
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
            <AlertDialogTitle>Delete this income?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the income record and updates your totals. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(busyId)}
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busyId ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
