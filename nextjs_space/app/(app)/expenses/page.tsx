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
import { Plus, TrendingDown, CheckCircle, MoreVertical, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/currencies';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ExpensesPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: '', category: '', amount: '', currency: 'USD', date: '', dueDate: '', vendorId: '', status: 'UNPAID', notes: '' });
  useEffect(() => { setForm((p: any) => ({ ...p, date: new Date().toISOString().split('T')[0] })); }, []);

  const fetchData = async () => {
    const [expRes, venRes, catRes] = await Promise.all([
      fetch('/api/expenses'), fetch('/api/vendors'), fetch('/api/categories?type=expense'),
    ]);
    setTransactions(await expRes.json().then((d: any) => Array.isArray(d) ? d : []));
    setVendors(await venRes.json().then((d: any) => Array.isArray(d) ? d : []));
    setCategories(await catRes.json().then((d: any) => Array.isArray(d) ? d : []));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.description.trim() || !form.amount) { toast.error('Description and amount required'); return; }
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    if (res.ok) { toast.success('Expense recorded!'); setOpen(false); fetchData(); setForm({ description: '', category: '', amount: '', currency: 'USD', date: new Date().toISOString().split('T')[0], dueDate: '', vendorId: '', status: 'UNPAID', notes: '' }); }
  };

  const markPaid = async (id: string) => {
    await fetch('/api/expenses', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'PAID' }) });
    toast.success('Marked as paid');
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    fetchData();
  };

  const totalUnpaid = transactions.filter((t: any) => t?.status === 'UNPAID').reduce((s: number, t: any) => s + (t?.amount ?? 0), 0);
  const totalPaid = transactions.filter((t: any) => t?.status === 'PAID').reduce((s: number, t: any) => s + (t?.amount ?? 0), 0);
  const summaryCurrency = transactions[0]?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground">Track and manage your business expenses</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Add Expense</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Record Expense</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Description *</Label><Input placeholder="What is this expense for?" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} /></div>
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
                <div className="space-y-1"><Label>Due date</Label><Input type="date" value={form.dueDate} onChange={(e: any) => setForm({ ...form, dueDate: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Category</Label>
                  <Select value={form.category} onValueChange={(v: string) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{categories.map((c: any) => <SelectItem key={c?.id} value={c?.name ?? ''}>{c?.name ?? ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Vendor</Label>
                  <Select value={form.vendorId} onValueChange={(v: string) => setForm({ ...form, vendorId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{vendors.map((v: any) => <SelectItem key={v?.id} value={v?.id ?? ''}>{v?.name ?? ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v: string) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="UNPAID">Unpaid</SelectItem><SelectItem value="PAID">Paid</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Notes</Label><Textarea placeholder="Notes" value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleCreate} className="w-full">Add Expense</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-red-500" /></div>
          <div><p className="text-xs text-muted-foreground">Unpaid</p><p className="text-lg font-mono font-bold text-red-600">{formatCurrency(totalUnpaid, summaryCurrency)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xs text-muted-foreground">Paid</p><p className="text-lg font-mono font-bold">{formatCurrency(totalPaid, summaryCurrency)}</p></div>
        </CardContent></Card>
      </div>

      {loading ? <div className="h-32 bg-muted rounded-lg animate-pulse" /> : (transactions?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-12 text-center"><TrendingDown className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">No expenses recorded</h3><p className="text-sm text-muted-foreground">Start tracking your expenses</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {transactions.map((t: any) => (
            <Card key={t?.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${t?.status === 'PAID' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <p className="text-sm font-medium">{t?.description ?? ''}</p>
                      <p className="text-xs text-muted-foreground">{t?.category ?? ''}{t?.vendor?.name ? ` • ${t.vendor.name}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono font-medium">{formatCurrency(t?.amount ?? 0, t?.currency ?? 'USD')}</p>
                      <p className="text-xs text-muted-foreground">{t?.dueDate ? `Due ${format(new Date(t.dueDate), 'MMM d')}` : t?.date ? format(new Date(t.date), 'MMM d, yyyy') : ''}</p>
                    </div>
                    <Badge className={t?.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{t?.status === 'PAID' ? 'Paid' : 'Unpaid'}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {t?.status === 'UNPAID' && <DropdownMenuItem onClick={() => markPaid(t.id)}><CheckCircle className="w-4 h-4 mr-2" /> Mark paid</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => handleDelete(t.id)} className="text-red-600"><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
