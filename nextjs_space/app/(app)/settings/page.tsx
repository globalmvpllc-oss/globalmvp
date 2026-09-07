'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Settings as SettingsIcon, Building2, Globe, Save, Upload, FileText, Palette } from 'lucide-react';
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
import { CURRENCIES, getCurrencySymbol } from '@/lib/currencies';
import { PAYMENT_METHODS, paymentMethodLabelKey } from '@/lib/validation';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';


/** Layouts the invoice renderer knows how to draw. Mirrors validation.ts.
 *  `value` is the stored setting and never changes with the language; the
 *  label and hint beside it are what the reader sees. */
const INVOICE_TEMPLATES = [
  { value: 'classic', labelKey: 'settings.templateClassic', hintKey: 'settings.templateClassicHint' },
  { value: 'modern', labelKey: 'settings.templateModern', hintKey: 'settings.templateModernHint' },
  { value: 'minimal', labelKey: 'settings.templateMinimal', hintKey: 'settings.templateMinimalHint' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: TranslationKey; hintKey: TranslationKey }>;

/** 0 is "due on receipt" — a real option, not a missing value. */
const PAYMENT_TERM_PRESETS = [0, 7, 14, 15, 30, 45, 60, 90];

const BRANDING_COLORS = [
  { key: 'primaryColor', labelKey: 'settings.primaryColour' },
  { key: 'secondaryColor', labelKey: 'settings.secondaryColour' },
  { key: 'accentColor', labelKey: 'settings.accentColour' },
] as const satisfies ReadonlyArray<{ key: string; labelKey: TranslationKey }>;

export default function SettingsPage() {
  const { t, fill } = useI18n();
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
          toast.error(t('error.unauthorized'));
          return null;
        }
        if (!r.ok) {
          toast.error(t('settings.loadFailed'));
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
        toast.error(t('error.network'));
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
          toast.error(t('settings.logoMissing'));
        } else if (err?.error) {
          toast.error(fill('settings.logoLoadFailed', { detail: err.error }));
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
      toast.error(check.message ?? t('settings.logoUnusable'));
      return;
    }

    setUploadingLogo(true);
    try {
      const optimized = await optimizeLogo(file);

      if (optimized.dataUrl.length > MAX_LOGO_DATA_URL_CHARS) {
        toast.error(t('settings.logoTooLarge'));
        return;
      }

      update('logoUrl', optimized.dataUrl);
      const kb = Math.max(1, Math.round(optimized.bytes / 1024));
      toast.success(
        fill('settings.logoReady', {
          width: optimized.width,
          height: optimized.height,
          kb,
        })
      );
    } catch {
      toast.error(t('settings.logoUnreadable'));
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
        toast.success(t('settings.saved'));
        return;
      }

      // The API returns { error, field } — reading it is the whole point.
      // Printing a fixed string here is what left users with "Failed to save
      // settings" and no idea which field was at fault.
      const body = await res.json().catch(() => null);
      if (body?.field) setErrorField(String(body.field));

      if (res.status === 401) {
        toast.error(t('error.unauthorized'));
      } else if (res.status === 403) {
        toast.error(t('settings.noPermission'));
      } else if (res.status === 400) {
        toast.error(body?.error ?? t('settings.checkFields'));
      } else if (res.status === 409) {
        toast.error(body?.error ?? t('settings.conflict'));
      } else {
        toast.error(body?.error ?? t('settings.saveFailed'));
      }
    } catch {
      toast.error(t('error.network'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">{t('common.loading')}</div></div>;

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
            <CardTitle className="text-base">{t('settings.noCompanyTitle')}</CardTitle>
            <CardDescription>{t('settings.noCompanyBody')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/onboarding">{t('settings.noCompanyAction')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{t('nav.settings')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {/* Company Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Building2 className="w-5 h-5 text-primary" /><CardTitle className="text-base">{t('settings.companyInfo')}</CardTitle></div>
          <CardDescription>{t('settings.companyInfoHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Company logo */}
          <div className="space-y-2">
            <Label>{t('settings.logo')}</Label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt={t('settings.logo')} className="h-full w-full object-contain" />
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
                  {uploadingLogo ? t('settings.optimizing') : form?.logoUrl ? t('settings.replaceLogo') : t('settings.uploadLogo')}
                </Button>
                {form?.logoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploadingLogo}
                    onClick={() => update('logoUrl', '')}
                  >
                    {t('settings.remove')}
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {fill('settings.logoHint', { formats: LOGO_FORMATS_LABEL, mb: MAX_LOGO_FILE_MB })}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('settings.businessName')}</Label><Input value={form?.name ?? ''} onChange={(e: any) => update('name', e.target.value)} className={fieldClass('name')} /></div>
            <div className="space-y-2"><Label>{t('settings.legalName')}</Label><Input value={form?.legalName ?? ''} onChange={(e: any) => update('legalName', e.target.value)} className={fieldClass('legalName')} placeholder={t('settings.legalNamePlaceholder')} /></div>
            <div className="space-y-2"><Label>{t('settings.businessType')}</Label><Input value={form?.businessType ?? ''} onChange={(e: any) => update('businessType', e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('common.email')}</Label><Input type="email" value={form?.email ?? ''} onChange={(e: any) => update('email', e.target.value)} className={fieldClass('email')} /></div>
            <div className="space-y-2"><Label>{t('common.phone')}</Label><Input value={form?.phone ?? ''} onChange={(e: any) => update('phone', e.target.value)} className={fieldClass('phone')} /></div>
            <div className="space-y-2"><Label>{t('settings.website')}</Label><Input value={form?.website ?? ''} onChange={(e: any) => update('website', e.target.value)} className={fieldClass('website')} /></div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Globe className="w-5 h-5 text-primary" /><CardTitle className="text-base">{t('settings.locationTax')}</CardTitle></div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('common.country')}</Label>
              <Select value={form?.country ?? 'US'} onValueChange={(v: string) => update('country', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COUNTRIES.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('customers.defaultCurrency')}</Label>
              <Select value={form?.defaultCurrency ?? 'USD'} onValueChange={(v: string) => update('defaultCurrency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                {/* Currency codes and symbols are never translated. */}
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code} ({getCurrencySymbol(c.code)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>{t('common.address')}</Label><Input value={form?.address ?? ''} onChange={(e: any) => update('address', e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('common.city')}</Label><Input value={form?.city ?? ''} onChange={(e: any) => update('city', e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('customers.state')}</Label><Input value={form?.state ?? ''} onChange={(e: any) => update('state', e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('customers.postalCode')}</Label><Input value={form?.postalCode ?? ''} onChange={(e: any) => update('postalCode', e.target.value)} /></div>
          </div>
          {form?.country === 'TR' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-2"><Label>{t('settings.taxNumberTr')}</Label><Input value={form?.taxNumber ?? ''} onChange={(e: any) => update('taxNumber', e.target.value)} className={fieldClass('taxNumber')} /></div>
              <div className="space-y-2"><Label>{t('settings.taxOfficeTr')}</Label><Input value={form?.taxOffice ?? ''} onChange={(e: any) => update('taxOffice', e.target.value)} /></div>
            </div>
          )}
          {form?.country !== 'TR' && (
            <div className="space-y-2">
              <Label>{t('settings.taxNumber')}</Label>
              <Input value={form?.taxNumber ?? ''} onChange={(e: any) => update('taxNumber', e.target.value)} placeholder={t('settings.taxNumberPlaceholder')} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice settings.
          These columns exist on Company and PUT /api/company already persists
          them, but nothing rendered them — so the values could never be set by
          a user. This wires the last leg of DB -> API -> UI. */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /><CardTitle className="text-base">{t('settings.invoiceSettings')}</CardTitle></div>
          <CardDescription>{t('settings.invoiceSettingsHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('settings.invoicePrefix')}</Label>
              <Input value={form?.invoicePrefix ?? ''} onChange={(e: any) => update('invoicePrefix', e.target.value)} className={fieldClass('invoicePrefix')} placeholder="INV-" />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.nextInvoiceNumber')}</Label>
              <Input type="number" min={1} step={1} value={form?.invoiceNextNumber ?? ''} onChange={(e: any) => update('invoiceNextNumber', e.target.value)} className={fieldClass('invoiceNextNumber')} />
              <p className="text-xs text-muted-foreground">
                {fill('settings.nextInvoicePreview', {
                  number: `${form?.invoicePrefix ?? 'INV-'}${String(Number(form?.invoiceNextNumber) || 1).padStart(4, '0')}`,
                })}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('settings.paymentTerms')}</Label>
              <Select value={String(form?.defaultPaymentTerms ?? 30)} onValueChange={(v: string) => update('defaultPaymentTerms', Number(v))}>
                <SelectTrigger className={fieldClass('defaultPaymentTerms')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERM_PRESETS.map((d: number) => (
                    <SelectItem key={d} value={String(d)}>{d === 0 ? t('settings.dueOnReceipt') : fill('settings.netDays', { days: d })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('settings.defaultTaxRate')}</Label>
              <Input type="number" min={0} max={100} step={0.01} value={form?.defaultTaxRate ?? ''} onChange={(e: any) => update('defaultTaxRate', e.target.value)} className={fieldClass('defaultTaxRate')} />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.invoiceTemplate')}</Label>
              <Select value={form?.invoiceTemplate ?? 'classic'} onValueChange={(v: string) => update('invoiceTemplate', v)}>
                <SelectTrigger className={fieldClass('invoiceTemplate')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVOICE_TEMPLATES.map((template) => <SelectItem key={template.value} value={template.value}>{t(template.labelKey)}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const chosen = INVOICE_TEMPLATES.find(
                    (template) => template.value === (form?.invoiceTemplate ?? 'classic')
                  );
                  return chosen ? t(chosen.hintKey) : '';
                })()}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t('settings.defaultPaymentMethod')}</Label>
              <Select value={form?.defaultPaymentMethod ?? 'bank_transfer'} onValueChange={(v: string) => update('defaultPaymentMethod', v)}>
                <SelectTrigger className={fieldClass('defaultPaymentMethod')}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => <SelectItem key={method} value={method}>{t(paymentMethodLabelKey(method))}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <Label>{t('settings.showLogo')}</Label>
              <p className="text-xs text-muted-foreground">{t('settings.showLogoHint')}</p>
            </div>
            <Switch checked={form?.invoiceShowLogo ?? true} onCheckedChange={(v: boolean) => update('invoiceShowLogo', v)} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <Label>{t('settings.showTax')}</Label>
              <p className="text-xs text-muted-foreground">{t('settings.showTaxHint')}</p>
            </div>
            <Switch checked={form?.invoiceShowTax ?? true} onCheckedChange={(v: boolean) => update('invoiceShowTax', v)} />
          </div>

          <div className="space-y-2">
            <Label>{t('settings.defaultInvoiceNotes')}</Label>
            <Textarea rows={3} value={form?.invoiceNotes ?? ''} onChange={(e: any) => update('invoiceNotes', e.target.value)} className={fieldClass('invoiceNotes')} placeholder={t('settings.defaultInvoiceNotesPlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.paymentInstructions')}</Label>
            <Textarea rows={3} value={form?.paymentInstructions ?? ''} onChange={(e: any) => update('paymentInstructions', e.target.value)} className={fieldClass('paymentInstructions')} placeholder={t('settings.paymentInstructionsPlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.bankDetails')}</Label>
            <Textarea rows={3} value={form?.bankTransferInstructions ?? ''} onChange={(e: any) => update('bankTransferInstructions', e.target.value)} className={fieldClass('bankTransferInstructions')} placeholder={t('settings.bankDetailsPlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.invoiceFooter')}</Label>
            <Input value={form?.invoiceFooter ?? ''} onChange={(e: any) => update('invoiceFooter', e.target.value)} className={fieldClass('invoiceFooter')} placeholder={t('settings.invoiceFooterPlaceholder')} />
          </div>
        </CardContent>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Palette className="w-5 h-5 text-primary" /><CardTitle className="text-base">{t('settings.branding')}</CardTitle></div>
          <CardDescription>{t('settings.brandingHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {BRANDING_COLORS.map((c) => (
              <div key={c.key} className="space-y-2">
                <Label>{t(c.labelKey)}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={t(c.labelKey)}
                    value={/^#[0-9a-fA-F]{6}$/.test(form?.[c.key] ?? '') ? form[c.key] : '#7C3AED'}
                    onChange={(e: any) => update(c.key, e.target.value)}
                    className="h-9 w-12 shrink-0 cursor-pointer rounded border border-border bg-transparent"
                  />
                  <Input value={(form as Record<string, string>)?.[c.key] ?? ''} onChange={(e: any) => update(c.key, e.target.value)} className={fieldClass(c.key)} placeholder="#7C3AED" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <Label>{t('settings.industry')}</Label>
            <Input value={form?.industry ?? ''} onChange={(e: any) => update('industry', e.target.value)} className={fieldClass('industry')} placeholder={t('settings.industryPlaceholder')} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" /> {saving ? t('common.saving') : t('settings.saveSettings')}
        </Button>
      </div>
    </div>
  );
}
