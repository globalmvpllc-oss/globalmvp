'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Users, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', companyName: '', email: '', phone: '', address: '', city: '', country: '', taxId: '', defaultCurrency: '', notes: '' });

  const fetchCustomers = async () => {
    const res = await fetch('/api/customers');
    const data = await res.json();
    setCustomers(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success('Customer added!');
      setForm({ name: '', companyName: '', email: '', phone: '', address: '', city: '', country: '', taxId: '', defaultCurrency: '', notes: '' });
      setOpen(false);
      fetchCustomers();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your customers and track their invoices</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Customer</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Name *</Label><Input placeholder="Customer name" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Company</Label><Input placeholder="Company name" value={form.companyName} onChange={(e: any) => setForm({ ...form, companyName: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Email</Label><Input type="email" placeholder="email@example.com" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="space-y-1"><Label>Phone</Label><Input placeholder="Phone number" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Country</Label><Input placeholder="Country" value={form.country} onChange={(e: any) => setForm({ ...form, country: e.target.value })} /></div>
                <div className="space-y-1"><Label>Tax/VAT ID</Label><Input placeholder="Tax ID" value={form.taxId} onChange={(e: any) => setForm({ ...form, taxId: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label>Address</Label><Input placeholder="Street address" value={form.address} onChange={(e: any) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-1"><Label>Notes</Label><Textarea placeholder="Additional notes" value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={handleCreate} className="w-full">Add Customer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i: number) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : (customers?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">No customers yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Add your first customer to start creating invoices.</p>
            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" /> Add Customer</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c: any) => (
            <Link key={c?.id} href={`/customers/${c?.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="pt-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">{(c?.name ?? '?')[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c?.name ?? 'Unnamed'}</p>
                      {c?.companyName && <p className="text-sm text-muted-foreground truncate">{c.companyName}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {c?.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                        {c?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{c?._count?.invoices ?? 0} invoices</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
