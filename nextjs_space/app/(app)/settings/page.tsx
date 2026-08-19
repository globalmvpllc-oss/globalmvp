'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings as SettingsIcon, Building2, Globe, Save } from 'lucide-react';
import { toast } from 'sonner';

const COUNTRIES = [
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' }, { code: 'TR', name: 'Turkey' },
  { code: 'NL', name: 'Netherlands' }, { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' }, { code: 'BR', name: 'Brazil' }, { code: 'JP', name: 'Japan' },
  { code: 'ES', name: 'Spain' }, { code: 'IT', name: 'Italy' }, { code: 'AE', name: 'UAE' },
  { code: 'SG', name: 'Singapore' },
];

export default function SettingsPage() {
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    fetch('/api/company').then((r: any) => r.json()).then((d: any) => {
      setCompany(d);
      setForm(d ?? {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch('/api/company', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success('Settings saved!');
      setCompany(await res.json());
    } else {
      toast.error('Failed to save settings');
    }
    setSaving(false);
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;

  const update = (key: string, val: any) => setForm((p: any) => ({ ...(p ?? {}), [key]: val }));

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your company settings and preferences</p>
      </div>

      {/* Company Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /><CardTitle className="text-base">Company Information</CardTitle></div>
          <CardDescription>Basic details about your business</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Business name</Label><Input value={form?.name ?? ''} onChange={(e: any) => update('name', e.target.value)} /></div>
            <div className="space-y-2"><Label>Legal name</Label><Input value={form?.legalName ?? ''} onChange={(e: any) => update('legalName', e.target.value)} placeholder="Legal entity name" /></div>
            <div className="space-y-2"><Label>Business type</Label><Input value={form?.businessType ?? ''} onChange={(e: any) => update('businessType', e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form?.email ?? ''} onChange={(e: any) => update('email', e.target.value)} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form?.phone ?? ''} onChange={(e: any) => update('phone', e.target.value)} /></div>
            <div className="space-y-2"><Label>Website</Label><Input value={form?.website ?? ''} onChange={(e: any) => update('website', e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /><CardTitle className="text-base">Location & Tax</CardTitle></div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Country</Label>
              <Select value={form?.country ?? 'US'} onValueChange={(v: string) => update('country', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COUNTRIES.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Default currency</Label>
              <Select value={form?.defaultCurrency ?? 'USD'} onValueChange={(v: string) => update('defaultCurrency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="USD">USD ($)</SelectItem><SelectItem value="EUR">EUR (€)</SelectItem><SelectItem value="GBP">GBP (£)</SelectItem><SelectItem value="TRY">TRY (₺)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Address</Label><Input value={form?.address ?? ''} onChange={(e: any) => update('address', e.target.value)} /></div>
            <div className="space-y-2"><Label>City</Label><Input value={form?.city ?? ''} onChange={(e: any) => update('city', e.target.value)} /></div>
            <div className="space-y-2"><Label>State/Province</Label><Input value={form?.state ?? ''} onChange={(e: any) => update('state', e.target.value)} /></div>
            <div className="space-y-2"><Label>Postal code</Label><Input value={form?.postalCode ?? ''} onChange={(e: any) => update('postalCode', e.target.value)} /></div>
          </div>
          {form?.country === 'TR' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-2"><Label>Tax number (Vergi No)</Label><Input value={form?.taxNumber ?? ''} onChange={(e: any) => update('taxNumber', e.target.value)} /></div>
              <div className="space-y-2"><Label>Tax office (Vergi Dairesi)</Label><Input value={form?.taxOffice ?? ''} onChange={(e: any) => update('taxOffice', e.target.value)} /></div>
            </div>
          )}
          {form?.country !== 'TR' && (
            <div className="space-y-2">
              <Label>Tax / VAT number</Label>
              <Input value={form?.taxNumber ?? ''} onChange={(e: any) => update('taxNumber', e.target.value)} placeholder="Tax identification number" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
