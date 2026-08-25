'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Users, Mail, Phone, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { personalizeEmptyState } from '@/lib/company-identity';
import { useCompany } from '@/hooks/use-company';
import { COUNTRIES } from '@/lib/countries';
import { CURRENCIES } from '@/lib/currencies';

/** Sentinel for "no selection" — Radix Select cannot hold an empty string value. */
const NONE = '__none__';

const EMPTY_FORM = {
  name: '',
  companyName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  taxId: '',
  defaultCurrency: '',
  notes: '',
};

type CustomerForm = typeof EMPTY_FORM;

/** Keeps only the fields the API accepts, so a fetched customer can seed the form. */
function toForm(customer: any): CustomerForm {
  const next: any = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    next[key] = customer?.[key] ?? '';
  }
  return next as CustomerForm;
}

export default function CustomersPage() {
  const company = useCompany();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  /** null = creating, otherwise the id being edited. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);

  const update = (key: keyof CustomerForm, value: string) =>
    setForm((p: CustomerForm) => ({ ...p, [key]: value }));

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/customers');
      if (!res.ok) {
        setLoadError(
          res.status === 401
            ? 'Your session has expired. Please sign in again.'
            : 'Could not load your customers. Please refresh the page.'
        );
        return;
      }
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch {
      setLoadError('Could not reach the server. Check your connection and refresh.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (customer: any) => {
    setEditingId(customer?.id ?? null);
    setForm(toForm(customer));
    setOpen(true);
  };

  /**
   * Creates or updates, depending on `editingId`.
   *
   * The previous version fired the POST and ignored the response entirely, so a
   * rejected customer (a country name longer than the two-letter code the API
   * accepts, for instance) left the dialog open with no explanation at all.
   */
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Customer name is required.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(editingId ? `/api/customers/${editingId}` : '/api/customers', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        toast.success(editingId ? 'Customer updated.' : 'Customer added.');
        setOpen(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
        await fetchCustomers();
        return;
      }

      const body = await res.json().catch(() => null);
      // Prefer whatever the API said; it is already a safe, specific message.
      const detail = typeof body?.error === 'string' && body.error !== 'Validation failed' ? body.error : null;

      if (res.status === 401) {
        toast.error('Your session has expired. Please sign in again.');
      } else if (res.status === 403) {
        toast.error("You don't have access to this business.");
      } else if (res.status === 404) {
        toast.error('That customer no longer exists. Refreshing the list.');
        setOpen(false);
        await fetchCustomers();
      } else if (res.status === 400) {
        toast.error(detail ?? 'Please check the details and try again.');
      } else if (res.status === 409) {
        toast.error(detail ?? 'Those details conflict with an existing customer.');
      } else {
        toast.error(detail ?? 'This customer could not be saved. Please try again.');
      }
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your customers and track their invoices</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add Customer
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next: boolean) => {
          // A save in flight must not be dismissed halfway.
          if (saving) return;
          setOpen(next);
          if (!next) setEditingId(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input placeholder="Customer name" value={form.name} onChange={(e: any) => update('name', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Company</Label>
                <Input placeholder="Company name" value={form.companyName} onChange={(e: any) => update('companyName', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" placeholder="email@example.com" value={form.email} onChange={(e: any) => update('email', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input placeholder="Phone number" value={form.phone} onChange={(e: any) => update('phone', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Country</Label>
                {/* A select, not free text: the API stores a country code and
                    rejects anything longer, so typing "Turkey" used to fail. */}
                <Select
                  value={form.country || NONE}
                  onValueChange={(v: string) => update('country', v === NONE ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not set</SelectItem>
                    {COUNTRIES.map((c: any) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tax/VAT ID</Label>
                <Input placeholder="Tax ID" value={form.taxId} onChange={(e: any) => update('taxId', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>City</Label>
                <Input placeholder="City" value={form.city} onChange={(e: any) => update('city', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>State/Province</Label>
                <Input placeholder="State or province" value={form.state} onChange={(e: any) => update('state', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Postal code</Label>
                <Input placeholder="Postal code" value={form.postalCode} onChange={(e: any) => update('postalCode', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Default currency</Label>
                <Select
                  value={form.defaultCurrency || NONE}
                  onValueChange={(v: string) => update('defaultCurrency', v === NONE ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Use business default" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Use business default</SelectItem>
                    {CURRENCIES.map((c: any) => (
                      <SelectItem key={c.code} value={c.code}>{c.code} ({c.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Input placeholder="Street address" value={form.address} onChange={(e: any) => update('address', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea placeholder="Additional notes" value={form.notes} onChange={(e: any) => update('notes', e.target.value)} />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Customer'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i: number) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : loadError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">{loadError}</p>
            <Button variant="outline" onClick={() => { setLoading(true); fetchCustomers(); }}>Try again</Button>
          </CardContent>
        </Card>
      ) : (customers?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">{personalizeEmptyState('No customers yet', company?.name)}</h3>
            <p className="text-sm text-muted-foreground mb-4">Add your first customer to start creating invoices.</p>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Customer</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c: any) => (
            <Card key={c?.id} className="hover:shadow-md transition-shadow h-full">
              <CardContent className="pt-5">
                <div className="flex items-start gap-3">
                  <Link href={`/customers/${c?.id}`} className="flex flex-1 min-w-0 items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">{(c?.name ?? '?')[0]?.toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c?.name ?? 'Unnamed'}</p>
                      {c?.companyName && <p className="text-sm text-muted-foreground truncate">{c.companyName}</p>}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {c?.email && <span className="flex items-center gap-1 min-w-0"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{c.email}</span></span>}
                        {c?.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" />{c.phone}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{c?._count?.invoices ?? 0} invoices</p>
                    </div>
                  </Link>
                  {/* Outside the Link, so opening the editor never navigates. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${c?.name ?? 'customer'}`}
                    className="shrink-0"
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
