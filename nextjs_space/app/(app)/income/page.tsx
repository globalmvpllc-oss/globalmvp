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
import { Plus, TrendingUp, CheckCircle, MoreVertical, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/currencies';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function IncomePage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: '', category: '', amount: '', currency: 'USD', date: '', expectedPaymentDate: '', customerId: '', status: 'EXPECTED', notes: '' });
  useEffect(() => { setForm((p: any) => ({ ...p, date: new Date().toISOString().split('T')[0] })); }, []);

  const fetchData = async () => {
    const [incRes, custRes, catRes] = await Promise.all([
      fetch('/api/income'), fetch('/api/customers'), fetch('/api/categories?type=income'),
    ]);
    setTransactions(await incRes.json().then((d: any) => Array.isArray(d) ? d : []));
    setCustomers(await custRes.json().then((d: any) => Array.isArray(d) ? d : []));
    setCategories(await catRes.json().then((d: any) => Array.isArray(d) ? d : []));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    if (!form.description.trim() || !form.amount) { toast.error('Description and amount required'); return; }
    const res = await fetch('/api/income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: Number(form.amount) }),
    });
    if (res.ok) { toast.success('Income recorded!'); setOpen(false); fetchData(); setForm({ description: '', category: '', amount: '', currency: 'USD', date: new Date().toISOString().split('T')[0], expectedPaymentDate: '', customerId: '', status: 'EXPECTED', notes: '' }); }
  };

  const markReceived = async (id: string) => {
    await fetch('/api/income', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'RECEIVED' }) });
    toast.success('Marked as received');
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/income?id=${id}`, { method: 'DELETE' });
    toast.success('Deleted');
    fetchData();
  };

  const totalExpected = transactions.filter((t: any) => t?.status === 'EXPECTED').reduce((s: number, t: any) => s + (t?.amount ?? 0), 0);
  const totalReceived = transactions.filter((t: any) => t?.status === 'RECEIVED').reduce((s: number, t: any) => s + (t?.amount ?? 0), 0);
  const summaryCurrency = transactions[0]?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Income</h1>
          <p className="text-muted-foreground">Track your income and expected payments</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" /> Add Income</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Record Income</DialogTitle></DialogHeader>
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
              <Button onClick={handleCreate} className="w-full">Add Income</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-amber-600" /></div>
          <div><p className="text-xs text-muted-foreground">Expected</p><p className="text-lg font-mono font-bold">{formatCurrency(totalExpected, summaryCurrency)}</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
          <div><p className="text-xs text-muted-foreground">Received</p><p className="text-lg font-mono font-bold text-green-600">{formatCurrency(totalReceived, summaryCurrency)}</p></div>
        </CardContent></Card>
      </div>

      {/* List */}
      {loading ? <div className="h-32 bg-muted rounded-lg animate-pulse" /> : (transactions?.length ?? 0) === 0 ? (
        <Card><CardContent className="py-12 text-center"><TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" /><h3 className="font-medium mb-1">No income recorded</h3><p className="text-sm text-muted-foreground">Start tracking your income</p></CardContent></Card>
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
                        {t?.status === 'EXPECTED' && <DropdownMenuItem onClick={() => markReceived(t.id)}><CheckCircle className="w-4 h-4 mr-2" /> Mark received</DropdownMenuItem>}
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
