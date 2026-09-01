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
import { Plus, TrendingDown, CheckCircle, MoreVertical, Trash2, Pencil } from 'lucide-react';
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
import { formatCalendarDate, toCalendarInput } from '@/lib/calendar-date';

export default function ExpensesPage() {
  const company = useCompany();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [newVendorName, setNewVendorName] = useState('');
  const [creatingVendor, setCreatingVendor] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** Set when the expense list itself could not be loaded, kept separate from the
   *  empty state so a 401/500 is not shown as "no expenses recorded". */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  /** Null while recording a new entry; the id while correcting one. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Id awaiting delete confirmation. Removing a money record is irreversible. */
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Row with a request in flight, so its actions can be disabled. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({ description: '', category: '', amount: '', currency: 'USD', date: '', dueDate: '', vendorId: '', status: 'UNPAID', notes: '' });
  useEffect(() => { setForm((p: any) => ({ ...p, date: new Date().toISOString().split('T')[0] })); }, []);

  const fetchData = async () => {
    setLoadError(null);
    try {
      const [expRes, venRes, catRes] = await Promise.all([
        fetch('/api/expenses'), fetch('/api/vendors'), fetch('/api/categories?type=expense'),
      ]);
      // The expense list is the page's primary data. A 401/403/500 here must not
      // fall through to an empty array and render as "no expenses recorded" —
      // that reads as lost data rather than a failed request.
      if (!expRes.ok) {
        setLoadError(await readErrorMessage(expRes));
        setTransactions([]);
        return;
      }
      const exp = await expRes.json();
      setTransactions(Array.isArray(exp) ? exp : []);
      // Vendors and categories are picklists; they degrade to empty quietly.
      setVendors(await venRes.json().then((d: any) => Array.isArray(d) ? d : []).catch(() => []));
      setCategories(await catRes.json().then((d: any) => Array.isArray(d) ? d : []).catch(() => []));
    } catch {
      setLoadError(NETWORK_ERROR_MESSAGE);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const emptyForm = () => ({ description: '', category: '', amount: '', currency: 'USD', date: new Date().toISOString().split('T')[0], dueDate: '', vendorId: '', status: 'UNPAID', notes: '' });

  const openCreate = () => { setEditingId(null); setForm(emptyForm()); setOpen(true); };

  /** Seeds the dialog from an existing record so it can be corrected. */
  const openEdit = (t: any) => {
    setEditingId(t?.id ?? null);
    setForm({
      ...emptyForm(),
      ...t,
      amount: String(t?.amount ?? ''),
      date: t?.date ? toCalendarInput(t.date) : '',
      dueDate: t?.dueDate ? toCalendarInput(t.dueDate) : '',
      vendorId: t?.vendorId ?? '',
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

      const res = await fetch('/api/expenses', {
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

      toast.success(editingId ? 'Expense updated.' : 'Expense recorded.');
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

  const markPaid = async (id: string) => {
    // The response was ignored: a rejected update still reported success, so
    // the list and the database disagreed until the next reload.
    setBusyId(id);
    try {
      const res = await fetch('/api/expenses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'PAID' }),
      });
      if (!res.ok) { toast.error(await readErrorMessage(res)); return; }
      toast.success('Marked as paid');
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
      const res = await fetch(`/api/expenses?id=${confirmDeleteId}`, { method: 'DELETE' });
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

  // See income page: Decimal columns arrive as strings and must be coerced.
  /**
   * Creates a vendor from inside the expense dialog.
   *
   * The vendor dropdown was previously unreachable: POST /api/vendors existed
   * but nothing in the UI called it, so the list could never be anything but
   * empty. This adds the missing path without changing the Vendor model.
   */
  const handleCreateVendor = async () => {
    const name = newVendorName.trim();
    if (!name) { toast.error('Enter a vendor name'); return; }
    setCreatingVendor(true);
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        const vendor = await res.json();
        // Refetch so the list matches the database rather than local state.
        const listRes = await fetch('/api/vendors');
        if (listRes.ok) setVendors(await listRes.json());
        setForm((f: any) => ({ ...f, vendorId: vendor?.id ?? '' }));
        setNewVendorName('');
        toast.success(`Vendor "${name}" added`);
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? 'Failed to add vendor');
      }
    } catch {
      toast.error('Failed to add vendor');
    } finally {
      setCreatingVendor(false);
    }
  };

  // Grouped by currency — see the income page: a single total across mixed
  // currencies is not a real figure.
  const unpaidByCurrency = sumAmountsByCurrency(
    transactions.filter((t: any) => t?.status === 'UNPAID'),
    (t: any) => t?.amount,
    (t: any) => t?.currency
  );
  const paidByCurrency = sumAmountsByCurrency(
    transactions.filter((t: any) => t?.status === 'PAID'),
    (t: any) => t?.amount,
    (t: any) => t?.currency
  );

  return (
    <div className="space-y-6">
      {/* The action drops below the heading rather than beside it on a narrow
          screen, where there is no room for both. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Track and manage your business expenses</p>
        </div>
        <Dialog open={open} onOpenChange={(next: boolean) => { if (saving) return; setOpen(next); if (!next) setEditingId(null); }}>
          <DialogTrigger asChild><Button onClick={openCreate} className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Add Expense</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? 'Edit Expense' : 'Record Expense'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Description *</Label><Input placeholder="What is this expense for?" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Amount *</Label><Input type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={(e: any) => setForm({ ...form, amount: e.target.value })} /></div>
                <div className="space-y-1"><Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v: string) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="GBP">GBP</SelectItem><SelectItem value="TRY">TRY</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={(e: any) => setForm({ ...form, date: e.target.value })} /></div>
                <div className="space-y-1"><Label>Due date</Label><Input type="date" value={form.dueDate} onChange={(e: any) => setForm({ ...form, dueDate: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Category</Label>
                  <Select value={form.category} onValueChange={(v: string) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{categories.map((c: any) => <SelectItem key={c?.id} value={c?.name ?? ''}>{c?.name ?? ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Vendor</Label>
                  <Select value={form.vendorId} onValueChange={(v: string) => setForm({ ...form, vendorId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={vendors.length ? 'Select' : 'No vendors yet'} />
                    </SelectTrigger>
                    <SelectContent>{vendors.map((v: any) => <SelectItem key={v?.id} value={v?.id ?? ''}>{v?.name ?? ''}</SelectItem>)}</SelectContent>
                  </Select>
                  <div className="flex gap-2 pt-1">
                    <Input
                      value={newVendorName}
                      onChange={(e: any) => setNewVendorName(e.target.value)}
                      placeholder="Add a new vendor"
                      className="h-11 sm:h-9"
                      onKeyDown={(e: any) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleCreateVendor(); }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 shrink-0 sm:h-9"
                      disabled={creatingVendor || !newVendorName.trim()}
                      onClick={handleCreateVendor}
                    >
                      {creatingVendor ? 'Adding…' : 'Add'}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="space-y-1"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v: string) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="UNPAID">Unpaid</SelectItem><SelectItem value="PAID">Paid</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleSave} className="w-full" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Record Expense'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-red-500" /></div>
          <div><p className="text-xs text-muted-foreground">Unpaid</p>{unpaidByCurrency.length === 0 ? (<p className="text-lg font-mono font-bold text-red-600">{formatCurrency(0, company?.defaultCurrency ?? 'USD')}</p>) : unpaidByCurrency.map((row: any) => (<p key={row.currency} className="text-lg font-mono font-bold text-red-600">{formatCurrency(row.total, row.currency)}</p>))}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xs text-muted-foreground">Paid</p>{paidByCurrency.length === 0 ? (<p className="text-lg font-mono font-bold">{formatCurrency(0, company?.defaultCurrency ?? 'USD')}</p>) : paidByCurrency.map((row: any) => (<p key={row.currency} className="text-lg font-mono font-bold">{formatCurrency(row.total, row.currency)}</p>))}</div>
        </CardContent></Card>
      </div>

      {loading ? <div className="h-32 bg-muted rounded-lg animate-pulse" /> : loadError ? (
        <Card><CardContent className="py-12 text-center"><TrendingDown className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">Could not load expenses</h3><p className="text-sm text-muted-foreground mb-4">{loadError}</p><Button variant="outline" onClick={() => { setLoading(true); fetchData(); }}>Try again</Button></CardContent></Card>
      ) : (transactions?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-12 text-center"><TrendingDown className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">{personalizeEmptyState('No expenses recorded', company?.name)}</h3><p className="text-sm text-muted-foreground">Start tracking your expenses</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {transactions.map((t: any) => (
            <Card key={t?.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                {/* Amount, status and actions wrap onto their own line below
                    `sm` rather than crushing the description. */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={`w-2 h-2 shrink-0 rounded-full ${t?.status === 'PAID' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t?.description ?? ''}</p>
                      <p className="text-xs text-muted-foreground">{t?.category ?? ''}{t?.vendor?.name ? ` • ${t.vendor.name}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
                    <div className="text-right">
                      <p className="font-mono font-medium">{formatCurrency(t?.amount ?? 0, t?.currency ?? 'USD')}</p>
                      <p className="text-xs text-muted-foreground">{t?.dueDate ? `Due ${formatCalendarDate(t.dueDate, 'MMM d')}` : t?.date ? formatCalendarDate(t.date) : ''}</p>
                    </div>
                    <Badge className={t?.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{t?.status === 'PAID' ? 'Paid' : 'Unpaid'}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {t?.status === 'UNPAID' && <DropdownMenuItem onClick={() => markPaid(t.id)} disabled={busyId === t.id}><CheckCircle className="w-4 h-4 mr-2" /> Mark paid</DropdownMenuItem>}
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
            <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the expense record and updates your totals. This cannot be undone.
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
