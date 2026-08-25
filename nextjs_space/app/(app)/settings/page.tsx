'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings as SettingsIcon, Building2, Globe, Save, Upload } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { COUNTRIES } from '@/lib/countries';
import { getCompanyInitials } from '@/lib/company-identity';
import {
  checkLogoFile,
  optimizeLogo,
  LOGO_ACCEPT_ATTRIBUTE,
  LOGO_FORMATS_LABEL,
  MAX_LOGO_FILE_MB,
  MAX_LOGO_DATA_URL_CHARS,
} from '@/lib/logo';
import { CURRENCIES } from '@/lib/currencies';


export default function SettingsPage() {
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  /** Field name the API flagged, so the offending input can be highlighted. */
  const [errorField, setErrorField] = useState<string | null>(null);

  const update = (key: string, val: any) => {
    if (errorField === key) setErrorField(null);
    setForm((p: any) => ({ ...(p ?? {}), [key]: val }));
  };

  /** Red ring on the input the API objected to. */
  const fieldClass = (key: string) =>
    errorField === key ? 'border-destructive focus-visible:ring-destructive' : undefined;

  useEffect(() => {
    // `r.ok` was never checked, and a null body was treated as a company. A user
    // with no company therefore got a blank but functional-looking form while
    // every action behind it failed with 403. The layout now redirects such
    // users to onboarding; this is the second line of defence and makes a real
    // load failure visible instead of silent.
    fetch('/api/company')
      .then(async (r: any) => {
        if (r.status === 401) {
          toast.error('Your session has expired. Please sign in again.');
          return null;
        }
        if (!r.ok) {
          toast.error('Could not load your company settings. Please refresh the page.');
          return null;
        }
        return r.json();
      })
      .then((d: any) => {
        if (d?.id) {
          setCompany(d);
          setForm(d);
        } else {
          setCompany(null);
          setForm({});
        }
        setLoading(false);
      })
      .catch(() => {
        toast.error('Could not reach the server. Check your connection and refresh.');
        setLoading(false);
      });
  }, []);

  /**
   * Resolves the stored logo into something an <img> can display.
   *
   * New logos are data URLs and are already displayable. Logos saved before the
   * move off S3 are storage keys and still need a signed read URL, so both are
   * handled rather than breaking existing companies.
   */
  useEffect(() => {
    const stored = form?.logoUrl;
    if (!stored) { setLogoPreview(null); return; }
    if (typeof stored === 'string' && stored.startsWith('data:')) {
      setLogoPreview(stored);
      return;
    }

    let active = true;
    fetch(`/api/upload/view?path=${encodeURIComponent(stored)}`)
      .then(async (r: any) => {
        if (r.ok) return r.json();
        const err = await r.json().catch(() => null);
        if (r.status === 404) {
          toast.error('The saved logo could not be found in storage. Upload it again.');
        } else if (err?.error) {
          toast.error(`Logo could not be loaded: ${err.error}`);
        }
        return null;
      })
      .then((d: any) => { if (active && d?.url) setLogoPreview(d.url); })
      .catch(() => {});
    return () => { active = false; };
  }, [form?.logoUrl]);

  /**
   * Prepares the logo entirely in the browser.
   *
   * The image is decoded, shrunk to fit 256px and re-encoded, then held on the
   * form as a data URL until Save. No upload endpoint, no bucket, no
   * credentials — a sidebar mark does not need object storage, and requiring it
   * meant the feature could not work at all without an AWS account.
   *
   * Decoding is also the real format check: a file renamed to .png fails here
   * rather than being trusted from its declared type.
   */
  const handleLogoUpload = async (file: File) => {
    const check = checkLogoFile(file);
    if (!check.ok) {
      toast.error(check.message ?? 'That image could not be used.');
      return;
    }

    setUploadingLogo(true);
    try {
      const optimized = await optimizeLogo(file);

      if (optimized.dataUrl.length > MAX_LOGO_DATA_URL_CHARS) {
        toast.error('Logo is too large after optimization. Please choose a simpler image.');
        return;
      }

      update('logoUrl', optimized.dataUrl);
      const kb = Math.max(1, Math.round(optimized.bytes / 1024));
      toast.success(`Logo ready (${optimized.width}×${optimized.height}, ${kb} KB). Press Save to apply it.`);
    } catch {
      toast.error('The selected image could not be read. Try a different file.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorField(null);
    try {
      const res = await fetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        const saved = await res.json();
        setCompany(saved);
        setForm(saved ?? {});
        toast.success('Settings saved');
        return;
      }

      // The API returns { error, field } — reading it is the whole point.
      // Printing a fixed string here is what left users with "Failed to save
      // settings" and no idea which field was at fault.
      const body = await res.json().catch(() => null);
      if (body?.field) setErrorField(String(body.field));

      if (res.status === 401) {
        toast.error('Your session has expired. Please sign in again.');
      } else if (res.status === 403) {
        toast.error('You do not have permission to change these settings.');
      } else if (res.status === 400) {
        toast.error(body?.error ?? 'These settings could not be saved. Please check the highlighted fields.');
      } else if (res.status === 409) {
        toast.error(body?.error ?? 'These settings conflict with an existing record.');
      } else {
        toast.error(body?.error ?? 'Unable to save settings right now. Please try again.');
      }
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;

  /**
   * Without a company nothing here can be saved, so say so rather than showing
   * inputs that are guaranteed to fail. The layout normally redirects first;
   * this covers a company disappearing mid-session.
   */
  if (!company?.id) {
    return (
      <div className="max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Set up your business first</CardTitle>
            <CardDescription>
              These settings belong to a business, and your account is not linked to one yet.
              Finish the short setup and you will come straight back here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/onboarding">Set up your business</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


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
          {/* Company logo */}
          <div className="space-y-2">
            <Label>Company logo</Label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="Company logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="font-display text-lg font-bold text-muted-foreground">
                    {getCompanyInitials(form?.name)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  id="logo-input"
                  type="file"
                  accept={LOGO_ACCEPT_ATTRIBUTE}
                  className="sr-only"
                  onChange={(e: any) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingLogo}
                  onClick={() => document.getElementById('logo-input')?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadingLogo ? 'Optimizing…' : form?.logoUrl ? 'Replace logo' : 'Upload logo'}
                </Button>
                {form?.logoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploadingLogo}
                    onClick={() => update('logoUrl', '')}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {`${LOGO_FORMATS_LABEL}. Maximum ${MAX_LOGO_FILE_MB} MB. The logo is optimized automatically and shown in the sidebar and on your invoices. Changes apply once you save.`}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Business name</Label><Input value={form?.name ?? ''} onChange={(e: any) => update('name', e.target.value)} className={fieldClass('name')} /></div>
            <div className="space-y-2"><Label>Legal name</Label><Input value={form?.legalName ?? ''} onChange={(e: any) => update('legalName', e.target.value)} className={fieldClass('legalName')} placeholder="Legal entity name" /></div>
            <div className="space-y-2"><Label>Business type</Label><Input value={form?.businessType ?? ''} onChange={(e: any) => update('businessType', e.target.value)} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form?.email ?? ''} onChange={(e: any) => update('email', e.target.value)} className={fieldClass('email')} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input value={form?.phone ?? ''} onChange={(e: any) => update('phone', e.target.value)} className={fieldClass('phone')} /></div>
            <div className="space-y-2"><Label>Website</Label><Input value={form?.website ?? ''} onChange={(e: any) => update('website', e.target.value)} className={fieldClass('website')} /></div>
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
              <div className="space-y-2"><Label>Tax number (Vergi No)</Label><Input value={form?.taxNumber ?? ''} onChange={(e: any) => update('taxNumber', e.target.value)} className={fieldClass('taxNumber')} /></div>
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
