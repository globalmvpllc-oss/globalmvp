'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Mail, Phone, MapPin, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { COUNTRIES, countryLabel } from '@/lib/countries';
import { useI18n } from '@/components/i18n-provider';
import { AccountStatement } from '@/components/account-statement';
import { useCompany } from '@/hooks/use-company';
import { isValidTrTaxId, trTaxIdRuleApplies } from '@/lib/tr-tax';

/** Sentinel for "no selection" — Radix Select cannot hold an empty string value. */
const NONE = '__none__';

const EMPTY_FORM = {
  name: '',
  companyName: '',
  email: '',
  phone: '',
  address: '',
  country: '',
  taxId: '',
  taxOffice: '',
  notes: '',
};
type VendorForm = typeof EMPTY_FORM;

function toForm(vendor: any): VendorForm {
  const next: any = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) next[key] = vendor?.[key] ?? '';
  return next as VendorForm;
}

/**
 * Vendor detail — contact details and the running account ledger.
 *
 * The mirror of the customer detail page, and deliberately the same shape: the
 * statement is the same component with the vendor endpoint behind it, so the
 * payable side of the business reads exactly like the receivable side.
 *
 * Details (including the tax number and tax office) can be edited here. There
 * is still no delete: the vendor's expense history would be orphaned.
 */
export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const company = useCompany();
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<VendorForm>(EMPTY_FORM);

  const update = (key: keyof VendorForm, value: string) =>
    setForm((p: VendorForm) => ({ ...p, [key]: value }));

  useEffect(() => {
    let active = true;
    // A non-OK body is `{ error: ... }` and is truthy, so storing it would draw
    // a vendor with blank fields instead of the "not found" state.
    fetch(`/api/vendors/${params?.id}`)
      .then((r: any) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (!active) return;
        setVendor(d);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params?.id]);

  const openEdit = () => {
    setForm(toForm(vendor));
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('vendors.nameRequired'));
      return;
    }
    if (form.taxId.trim() && trTaxIdRuleApplies(form.country, company?.country) && !isValidTrTaxId(form.taxId)) {
      toast.error(t('customers.taxIdInvalid'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/vendors/${params?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setVendor(await res.json());
        setEditOpen(false);
        toast.success(t('vendors.saved'));
        return;
      }
      const body = await res.json().catch(() => null);
      if (body?.code === 'TAX_ID_INVALID') toast.error(t('customers.taxIdInvalid'));
      else if (res.status === 409) toast.error(typeof body?.error === 'string' ? body.error : t('vendors.saveFailed'));
      else toast.error(t('vendors.saveFailed'));
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="animate-pulse text-muted-foreground">{t('statement.loading')}</div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4">{t('vendors.notFound')}</p>
        <Button variant="outline" onClick={() => router.push('/vendors')}>
          {t('vendors.back')}
        </Button>
      </div>
    );
  }

  const hasContact = Boolean(
    vendor?.email || vendor?.phone || vendor?.address || vendor?.taxId || vendor?.taxOffice
  );
  const trRule = trTaxIdRuleApplies(form.country, company?.country);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={t('vendors.back')}
          onClick={() => router.push('/vendors')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-display font-bold tracking-tight">
            {vendor?.name ?? ''}
          </h1>
          {vendor?.companyName && (
            <p className="truncate text-muted-foreground">{vendor.companyName}</p>
          )}
        </div>
        <Button variant="outline" className="shrink-0" onClick={openEdit}>
          <Pencil className="mr-2 h-4 w-4" /> {t('vendors.edit')}
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={(next: boolean) => { if (!saving) setEditOpen(next); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('vendors.editTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('vendors.name')} *</Label>
                <Input value={form.name} onChange={(e: any) => update('name', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('vendors.companyName')}</Label>
                <Input value={form.companyName} onChange={(e: any) => update('companyName', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('common.email')}</Label>
                <Input type="email" value={form.email} onChange={(e: any) => update('email', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('common.phone')}</Label>
                <Input value={form.phone} onChange={(e: any) => update('phone', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('common.country')}</Label>
              <Select value={form.country || NONE} onValueChange={(v: string) => update('country', v === NONE ? '' : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('common.notSet')}</SelectItem>
                  {COUNTRIES.map((c: any) => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('common.taxId')}</Label>
                <Input
                  inputMode={trRule ? 'numeric' : undefined}
                  placeholder={trRule ? t('customers.taxIdTr') : t('common.taxId')}
                  value={form.taxId}
                  onChange={(e: any) => update('taxId', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('vendors.taxOffice')}</Label>
                <Input value={form.taxOffice} onChange={(e: any) => update('taxOffice', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('common.address')}</Label>
              <Input value={form.address} onChange={(e: any) => update('address', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('common.notes')}</Label>
              <Textarea value={form.notes} onChange={(e: any) => update('notes', e.target.value)} />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? t('common.saving') : t('common.saveChanges')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {hasContact && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('vendors.contact')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              {vendor?.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span suppressHydrationWarning>{vendor.email}</span>
                </div>
              )}
              {vendor?.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span suppressHydrationWarning>{vendor.phone}</span>
                </div>
              )}
              {vendor?.address && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {vendor.address}
                    {vendor?.country ? `, ${countryLabel(vendor.country)}` : ''}
                  </span>
                </div>
              )}
              {vendor?.taxId && (
                <div>
                  <span className="text-muted-foreground">{t('vendors.taxId')}: </span>
                  {vendor.taxId}
                </div>
              )}
              {vendor?.taxOffice && (
                <div>
                  <span className="text-muted-foreground">{t('vendors.taxOffice')}: </span>
                  {vendor.taxOffice}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <AccountStatement
        endpoint={`/api/vendors/${params?.id}/statement`}
        kind="vendor"
        fileNameBase={`statement-${vendor?.name ?? 'vendor'}`}
      />
    </div>
  );
}
