'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Building2, Globe, Coins, Briefcase, MapPin, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { COUNTRIES } from '@/lib/countries';
import { CURRENCIES } from '@/lib/currencies';
import { readErrorMessage, networkErrorMessage } from '@/lib/api-feedback';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { writeActiveCompanyCookie } from '@/lib/active-company';
import { track } from '@/lib/tracking/events';

/**
 * `useSearchParams` makes this page dynamic. Without saying so, `next build`
 * refuses to prerender it and fails the whole build rather than shipping a page
 * whose HTML would be wrong for half its visitors.
 */
export const dynamic = 'force-dynamic';

/** Stored values stay English; only the label follows the language. */
const BUSINESS_TYPES: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: 'Freelancer', labelKey: 'onboarding.type.freelancer' },
  { value: 'Sole Proprietor', labelKey: 'onboarding.type.soleProprietor' },
  { value: 'LLC', labelKey: 'onboarding.type.llc' },
  { value: 'Corporation', labelKey: 'onboarding.type.corporation' },
  { value: 'Partnership', labelKey: 'onboarding.type.partnership' },
  { value: 'Agency', labelKey: 'onboarding.type.agency' },
  { value: 'E-commerce', labelKey: 'onboarding.type.ecommerce' },
  { value: 'Consultant', labelKey: 'onboarding.type.consultant' },
  { value: 'Other', labelKey: 'onboarding.type.other' },
];

export default function OnboardingPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Where to go once there is a company: the dashboard, as always, unless the
   * visitor said otherwise before they had an account.
   *
   * This is the last link in the chain that starts on the public pricing — a
   * plan pressed there travels through signup to here, and lands on Settings ›
   * Billing with that plan marked. Validated rather than trusted, by the same
   * helper the auth pages use, so a hand-written `callbackUrl` cannot send a
   * new user off this site.
   */
  const destination = safeRedirectPath(searchParams.get('callbackUrl'), '/dashboard');

  /**
   * Whether this run is adding a further company rather than the first one.
   *
   * The switcher links here with `add=1`. Without it the guard below bounces
   * anyone who already has a company, which is what used to make a second one
   * unreachable.
   *
   * It is not a permission: it only decides whether this screen redirects. The
   * decision about whether a company may be created at all belongs to
   * POST /api/company, which authorises against the session, and the guard in
   * `(app)/layout.tsx` still sends a company-less user here regardless.
   */
  const addingAnother = searchParams.get('add') === '1';

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  /** Why the last attempt failed, shown next to the finish button. */
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Guard: redirect if user already has a company, unless they came here to
  // add another on purpose.
  useEffect(() => {
    if (addingAnother) {
      setChecking(false);
      return;
    }
    fetch('/api/company')
      .then((r) => r.json())
      .then((c) => {
        if (c?.id) {
          router.replace(destination);
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router, destination, addingAnother]);

  const [form, setForm] = useState({
    name: '', country: 'US', defaultCurrency: 'USD', businessType: 'Freelancer', usageMode: 'finance',
    address: '', city: '', postalCode: '', taxNumber: '', taxOffice: '',
  });

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const update = (key: string, val: string) => setForm((p: any) => ({ ...p, [key]: val }));

  const handleFinish = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        /**
         * The company just created becomes the active one.
         *
         * Written before navigating so the very first render of the
         * destination is already scoped to it — otherwise someone who just
         * created their second company would land on the first one's
         * dashboard. `refresh()` drops the router cache, which would
         * otherwise replay a page rendered under the previous company.
         *
         * Only ever the id the server just returned. Nothing is trusted from
         * the form, and the cookie is re-checked against membership on the
         * next request anyway.
         */
        const created = await res.json().catch(() => null);
        if (created?.id) writeActiveCompanyCookie(created.id);

        // The sign-up conversion: a new account has finished setting up its
        // first company. Covers email and Google sign-ups alike, and is not
        // sent when an existing user adds another company. track() checks
        // consent and sends nothing personal.
        if (!addingAnother) track({ name: 'sign_up' });

        // Success path otherwise unchanged: the spinner stays up through the
        // navigation so the button cannot be pressed twice mid-redirect.
        router.refresh();
        router.replace(form.usageMode === 'stock' ? '/kolaystok/app' : destination);
        return;
      }

      // Previously there was no else branch and the catch was a noop, so a
      // rejected request left the user on this screen with no message and no
      // way into the product — with nothing on screen to explain why.
      setError(await readErrorMessage(res, locale));
    } catch {
      setError(networkErrorMessage(locale));
    } finally {
      // Runs on the failure paths; the success path has already returned.
      setLoading(false);
    }
  };

  const steps = [
    { icon: Building2, title: t('onboarding.businessName'), desc: t('onboarding.businessNameDesc') },
    { icon: Globe, title: t('onboarding.country'), desc: t('onboarding.countryDesc') },
    { icon: Coins, title: t('onboarding.currency'), desc: t('onboarding.currencyDesc') },
    { icon: Briefcase, title: t('onboarding.businessType'), desc: t('onboarding.businessTypeDesc') },
    { icon: MapPin, title: t('onboarding.details'), desc: t('onboarding.detailsDesc') },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-display font-bold tracking-tight">CorpControl</span>
        </div>
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((_: any, i: number) => (
            <div key={i} className={`h-2 w-12 rounded-full transition-colors ${i + 1 <= step ? 'bg-primary' : 'bg-gray-200'}`} />
          ))}
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              {(() => { const Icon = steps[step - 1]?.icon ?? Building2; return <Icon className="w-5 h-5 text-primary" />; })()}
              <div>
                <CardTitle className="text-lg">{steps[step - 1]?.title ?? ''}</CardTitle>
                <CardDescription>{steps[step - 1]?.desc ?? ''}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {step === 1 && (
              <div className="space-y-2">
                <Label>{t('onboarding.businessName')}</Label>
                <Input placeholder={t('onboarding.namePlaceholder')} value={form.name} onChange={(e: any) => update('name', e.target.value)} autoFocus />
              </div>
            )}
            {step === 2 && (
              <div className="space-y-2">
                <Label>{t('onboarding.country')}</Label>
                <Select
                  value={form.country}
                  onValueChange={(v: string) => {
                    update('country', v);
                    // Turkey starts on Turkish lira; the next step can still change it.
                    if (v === 'TR') update('defaultCurrency', 'TRY');
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.country === 'TR' && <p className="text-sm text-muted-foreground">{t('onboarding.trHint')}</p>}
              </div>
            )}
            {step === 3 && (
              <div className="space-y-2">
                <Label>{t('onboarding.currency')}</Label>
                <Select value={form.defaultCurrency} onValueChange={(v: string) => update('defaultCurrency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c: any) => <SelectItem key={c.code} value={c.code}>{`${c.name} (${c.symbol})`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {step === 4 && (
              <div className="space-y-2">
                <Label>{t('onboarding.businessType')}</Label>
                <Select value={form.businessType} onValueChange={(v: string) => update('businessType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{t(type.labelKey)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {/* What this company will use CorpControl for. "Sadece stok"
                    opens Avc KolayStok and hides the invoice menus. */}
                <p className="pt-3 text-base font-medium">{t('ks.mode.title')}</p>
                <div className="grid gap-2" role="radiogroup" aria-label={t('ks.mode.title')}>
                  {(['finance', 'stock', 'both'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={form.usageMode === m}
                      onClick={() => update('usageMode', m)}
                      className={`h-12 rounded-lg border px-3 text-left text-base ${form.usageMode === m ? 'border-primary bg-primary/10 font-semibold' : ''}`}
                    >
                      {t(`ks.mode.${m}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 5 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t('onboarding.address')}</Label>
                    <Input placeholder={t('onboarding.addressPlaceholder')} value={form.address} onChange={(e: any) => update('address', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('onboarding.city')}</Label>
                    <Input placeholder={t('onboarding.city')} value={form.city} onChange={(e: any) => update('city', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t('onboarding.postalCode')}</Label>
                  <Input placeholder={t('onboarding.postalCode')} value={form.postalCode} onChange={(e: any) => update('postalCode', e.target.value)} />
                </div>
                {form.country === 'TR' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{t('onboarding.taxNumber')}</Label>
                      <Input inputMode="numeric" placeholder={t('onboarding.taxNumber')} value={form.taxNumber} onChange={(e: any) => update('taxNumber', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>{t('onboarding.taxOffice')}</Label>
                      <Input placeholder={t('onboarding.taxOffice')} value={form.taxOffice} onChange={(e: any) => update('taxOffice', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {error ? (
              <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-between mt-6">
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> {t('onboarding.back')}</Button>
              ) : <div />}
              {step < 5 ? (
                <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !form.name.trim()}>
                  {t('onboarding.next')} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleFinish} disabled={loading || !form.name.trim()}>
                  <Check className="w-4 h-4 mr-1" /> {loading ? t('onboarding.finishing') : t('onboarding.finish')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
