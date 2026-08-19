'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, FileText, Mail, Phone, MapPin, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import { getStatusBadge } from '@/lib/invoice-helpers';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/customers/${params?.id}`).then((r: any) => r.json()).then((d: any) => {
      setCustomer(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [params?.id]);

  const handleDelete = async () => {
    if (!confirm('Delete this customer? This will also remove related invoices.')) return;
    await fetch(`/api/customers/${params?.id}`, { method: 'DELETE' });
    toast.success('Customer deleted');
    router.push('/customers');
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><div className="animate-pulse text-muted-foreground">Loading...</div></div>;
  if (!customer) return <div className="text-center py-12">Customer not found</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/customers')}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold tracking-tight">{customer?.name ?? ''}</h1>
          {customer?.companyName && <p className="text-muted-foreground">{customer.companyName}</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={handleDelete}><Trash2 className="w-4 h-4 text-red-500" /></Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Total Invoiced</p><p className="text-lg font-mono font-bold">{formatCurrency(customer?.totalInvoiced ?? 0, customer?.defaultCurrency ?? 'USD')}</p></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Total Paid</p><p className="text-lg font-mono font-bold text-green-600">{formatCurrency(customer?.totalPaid ?? 0, customer?.defaultCurrency ?? 'USD')}</p></CardContent></Card>
        <Card><CardContent className="pt-5 pb-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-lg font-mono font-bold text-amber-600">{formatCurrency(customer?.outstanding ?? 0, customer?.defaultCurrency ?? 'USD')}</p></CardContent></Card>
      </div>

      {/* Contact Info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {customer?.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><span suppressHydrationWarning>{customer.email}</span></div>}
            {customer?.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span suppressHydrationWarning>{customer.phone}</span></div>}
            {customer?.address && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span>{customer.address}{customer?.city ? `, ${customer.city}` : ''}{customer?.country ? `, ${customer.country}` : ''}</span></div>}
            {customer?.taxId && <div><span className="text-muted-foreground">Tax ID: </span>{customer.taxId}</div>}
          </div>
        </CardContent>
      </Card>

      {/* Invoice History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Invoice History</CardTitle></CardHeader>
        <CardContent>
          {(customer?.invoices?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No invoices yet</p>
          ) : (
            <div className="space-y-2">
              {(customer?.invoices ?? []).map((inv: any) => {
                const si = getStatusBadge(inv?.status ?? 'DRAFT');
                return (
                  <Link key={inv?.id} href={`/invoices/${inv?.id}`} className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{inv?.invoiceNumber ?? ''}</p>
                        <p className="text-xs text-muted-foreground">{inv?.dueDate ? format(new Date(inv.dueDate), 'MMM d, yyyy') : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm">{formatCurrency(inv?.total ?? 0, inv?.currency ?? 'USD')}</span>
                      <Badge className={si?.color ?? ''}>{si?.label ?? ''}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
