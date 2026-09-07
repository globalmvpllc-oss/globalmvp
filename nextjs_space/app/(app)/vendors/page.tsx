'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Truck, Mail, Phone } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';
import type { TranslationKey } from '@/lib/i18n';

/**
 * Vendor list.
 *
 * Deliberately read-only. Vendors are still created inside the expense dialog,
 * which is where a vendor actually comes into existence for this product, and
 * adding a second creation path here would be a CRUD suite this task does not
 * need. What was missing was any way to reach a vendor's account at all —
 * before this, a vendor existed only as a name in a dropdown.
 *
 * Mirrors the customer list card for card, so the two sides of the ledger feel
 * like one product.
 */
export default function VendorsPage() {
  const { t } = useI18n();
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<TranslationKey | null>(null);

  const fetchVendors = async () => {
    try {
      const res = await fetch('/api/vendors');
      if (!res.ok) {
        setLoadError('vendors.error');
        return;
      }
      const data = await res.json();
      setVendors(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch {
      setLoadError('vendors.errorNetwork');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">{t('vendors.title')}</h1>
        <p className="text-muted-foreground">{t('vendors.subtitle')}</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i: number) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : loadError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="mb-4 text-sm text-muted-foreground">{t(loadError)}</p>
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                fetchVendors();
              }}
            >
              {t('vendors.retry')}
            </Button>
          </CardContent>
        </Card>
      ) : vendors.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="mx-auto mb-3 h-12 w-12 text-muted-foreground opacity-40" />
            <h3 className="mb-1 font-medium">{t('vendors.empty')}</h3>
            <p className="mx-auto mb-4 max-w-md text-sm text-muted-foreground">
              {t('vendors.emptyHint')}
            </p>
            <Button asChild>
              <Link href="/expenses">{t('vendors.emptyAction')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vendors.map((v: any) => (
            <Card key={v?.id} className="h-full transition-shadow hover:shadow-md">
              <CardContent className="pt-5">
                <Link href={`/vendors/${v?.id}`} className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <span className="text-sm font-bold text-primary">
                      {(v?.name ?? '?')[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{v?.name ?? ''}</p>
                    {v?.companyName && (
                      <p className="truncate text-sm text-muted-foreground">{v.companyName}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {v?.email && (
                        <span className="flex min-w-0 items-center gap-1">
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate">{v.email}</span>
                        </span>
                      )}
                      {v?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          {v.phone}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('vendors.expenseCount').replace(
                        '{count}',
                        String(v?._count?.expenseTransactions ?? 0)
                      )}
                    </p>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
