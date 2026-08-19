'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, MoreVertical, Copy, Send, CheckCircle, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/currencies';
import { getStatusBadge } from '@/lib/invoice-helpers';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchInvoices = async (status?: string) => {
    setLoading(true);
    const s = status ?? statusFilter;
    const res = await fetch(`/api/invoices?status=${s}`);
    const data = await res.json();
    setInvoices(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { fetchInvoices(); }, [statusFilter]);

  const handleStatusChange = async (id: string, status: string) => {
    await fetch(`/api/invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    toast.success(`Invoice marked as ${status.toLowerCase().replace('_', ' ')}`);
    fetchInvoices();
  };

  const handleDuplicate = async (invoice: any) => {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: invoice?.customerId,
        dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
        currency: invoice?.currency,
        notes: invoice?.notes,
        items: (invoice?.items ?? []).map((item: any) => ({
          description: item?.description,
          quantity: item?.quantity,
          unitPrice: item?.unitPrice,
          discount: item?.discount,
          taxRate: item?.taxRate,
          taxLabel: item?.taxLabel,
        })),
      }),
    });
    if (res.ok) {
      toast.success('Invoice duplicated');
      fetchInvoices();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">Create, manage, and track your invoices</p>
        </div>
        <Link href="/invoices/new">
          <Button><Plus className="w-4 h-4 mr-2" /> Create Invoice</Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="OVERDUE">Overdue</SelectItem>
            <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i: number) => <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : (invoices?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-medium mb-1">No invoices yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first invoice to start tracking payments.</p>
            <Link href="/invoices/new"><Button><Plus className="w-4 h-4 mr-2" /> Create Invoice</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv: any) => {
            const statusInfo = getStatusBadge(inv?.status ?? 'DRAFT');
            return (
              <Card key={inv?.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <Link href={`/invoices/${inv?.id}`} className="font-medium hover:text-primary transition-colors">
                          {inv?.invoiceNumber ?? ''}
                        </Link>
                        <p className="text-sm text-muted-foreground">{inv?.customer?.name ?? inv?.customer?.companyName ?? 'No customer'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-mono font-medium">{formatCurrency(inv?.total ?? 0, inv?.currency ?? 'USD')}</p>
                        <p className="text-xs text-muted-foreground">Due {inv?.dueDate ? format(new Date(inv.dueDate), 'MMM d, yyyy') : 'N/A'}</p>
                      </div>
                      <Badge className={statusInfo?.color ?? ''}>{statusInfo?.label ?? inv?.status}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild><Link href={`/invoices/${inv?.id}`}>View details</Link></DropdownMenuItem>
                          {inv?.status === 'DRAFT' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(inv.id, 'SENT')}>
                              <Send className="w-4 h-4 mr-2" /> Mark as sent
                            </DropdownMenuItem>
                          )}
                          {['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv?.status) && (
                            <DropdownMenuItem onClick={() => handleStatusChange(inv.id, 'PAID')}>
                              <CheckCircle className="w-4 h-4 mr-2" /> Mark as paid
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDuplicate(inv)}>
                            <Copy className="w-4 h-4 mr-2" /> Duplicate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
