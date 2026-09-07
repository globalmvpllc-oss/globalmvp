'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Mail, Phone, MapPin } from 'lucide-react';
import { countryLabel } from '@/lib/countries';
import { useI18n } from '@/components/i18n-provider';
import { AccountStatement } from '@/components/account-statement';

/**
 * Vendor detail — contact details and the running account ledger.
 *
 * The mirror of the customer detail page, and deliberately the same shape: the
 * statement is the same component with the vendor endpoint behind it, so the
 * payable side of the business reads exactly like the receivable side.
 *
 * No edit or delete control, matching the read-only vendor API. Deleting a
 * vendor needs the same guard the customer route has (its expense history would
 * be orphaned), and that belongs with the screen that offers it.
 */
export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  const hasContact = Boolean(vendor?.email || vendor?.phone || vendor?.address || vendor?.taxId);

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
      </div>

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
