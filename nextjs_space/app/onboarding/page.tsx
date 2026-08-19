'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Building2, Globe, Coins, Briefcase, MapPin, ChevronRight, ChevronLeft, Check } from 'lucide-react';

const COUNTRIES = [
  { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' }, { code: 'FR', name: 'France' }, { code: 'TR', name: 'Turkey' },
  { code: 'NL', name: 'Netherlands' }, { code: 'CA', name: 'Canada' }, { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' }, { code: 'BR', name: 'Brazil' }, { code: 'JP', name: 'Japan' },
  { code: 'ES', name: 'Spain' }, { code: 'IT', name: 'Italy' }, { code: 'AE', name: 'UAE' },
  { code: 'SG', name: 'Singapore' },
];

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar ($)' }, { code: 'EUR', name: 'Euro (€)' },
  { code: 'GBP', name: 'British Pound (£)' }, { code: 'TRY', name: 'Turkish Lira (₺)' },
];

const BUSINESS_TYPES = [
  'Freelancer', 'Sole Proprietor', 'LLC', 'Corporation', 'Partnership', 'Agency', 'E-commerce', 'Consultant', 'Other',
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Guard: redirect if user already has a company
  useEffect(() => {
    fetch('/api/company')
      .then((r) => r.json())
      .then((c) => {
        if (c?.id) {
          router.replace('/dashboard');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  const [form, setForm] = useState({
    name: '', country: 'US', defaultCurrency: 'USD', businessType: 'Freelancer',
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
    setLoading(true);
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        router.replace('/dashboard');
      }
    } catch { /* noop */ }
    setLoading(false);
  };

  const steps = [
    { icon: Building2, title: 'Business name', desc: 'What’s your business called?' },
    { icon: Globe, title: 'Country', desc: 'Where is your business based?' },
    { icon: Coins, title: 'Currency', desc: 'Your primary currency' },
    { icon: Briefcase, title: 'Business type', desc: 'What kind of business?' },
    { icon: MapPin, title: 'Details', desc: 'Address and tax info (optional)' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 px-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-display font-bold tracking-tight">FinanceFlow</span>
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
                <Label>Business name</Label>
                <Input placeholder="Acme Inc" value={form.name} onChange={(e: any) => update('name', e.target.value)} autoFocus />
              </div>
            )}
            {step === 2 && (
              <div className="space-y-2">
                <Label>Country</Label>
                <Select value={form.country} onValueChange={(v: string) => update('country', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {step === 3 && (
              <div className="space-y-2">
                <Label>Default currency</Label>
                <Select value={form.defaultCurrency} onValueChange={(v: string) => update('defaultCurrency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c: any) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {step === 4 && (
              <div className="space-y-2">
                <Label>Business type</Label>
                <Select value={form.businessType} onValueChange={(v: string) => update('businessType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((t: any) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {step === 5 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Address</Label>
                    <Input placeholder="Street address" value={form.address} onChange={(e: any) => update('address', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>City</Label>
                    <Input placeholder="City" value={form.city} onChange={(e: any) => update('city', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Postal code</Label>
                  <Input placeholder="Postal code" value={form.postalCode} onChange={(e: any) => update('postalCode', e.target.value)} />
                </div>
                {form.country === 'TR' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Tax number</Label>
                      <Input placeholder="Tax number" value={form.taxNumber} onChange={(e: any) => update('taxNumber', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Tax office</Label>
                      <Input placeholder="Tax office" value={form.taxOffice} onChange={(e: any) => update('taxOffice', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between mt-6">
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
              ) : <div />}
              {step < 5 ? (
                <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !form.name.trim()}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleFinish} disabled={loading || !form.name.trim()}>
                  <Check className="w-4 h-4 mr-1" /> {loading ? 'Setting up...' : 'Finish setup'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
