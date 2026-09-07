'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, MoreVertical, Copy, Send, CheckCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/currencies';
import { getStatusBadge, INVOICE_STATUSES } from '@/lib/invoice-helpers';
import { personalizeEmptyState } from '@/lib/company-identity';
import { useCompany } from '@/hooks/use-company';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkPdfButton } from '@/components/bulk-pdf-button';
import { useI18n } from '@/components/i18n-provider';
import { toast } from 'sonner';
import { readErrorMessage } from '@/lib/api-feedback';
import { formatCalendarDate } from '@/lib/calendar-date';

export default function InvoicesPage() {
  const company = useCompany();
  const [invoices, setInvoices] = useState<any[]>([]);
  const { t, fill, locale, intl } = useI18n();
  /** Ids ticked for bulk download. Cleared implicitly when the list reloads. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleOne = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );

  const allSelected = invoices.length > 0 && selectedIds.length === invoices.length;
  const toggleAll = () =>
    setSelectedIds(allSelected ? [] : invoices.map((invoice: any) => invoice?.id).filter(Boolean));
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
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      // A rejected transition returns 409/400. Reporting success anyway would
      // leave the badge the user sees disagreeing with the stored status.
      if (!res.ok) {
        toast.error(await readErrorMessage(res, locale));
        return;
      }
      // The badge label for the new status, translated — never the stored
      // value spelled out, which would print "PARTIALLY_PAID" in Turkish.
      toast.success(fill('invoices.statusChanged', { status: t(getStatusBadge(status).labelKey) }));
      fetchInvoices();
    } catch {
      toast.error(t('error.network'));
    }
  };

  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  /**
   * Duplicating needs the invoice's line items, and the list endpoint returns
   * only a count of them (it stays lean on purpose). So fetch the full invoice
   * first, then post a fresh one.
   *
   * The copy is deliberately independent: no payments are carried over, the
   * status starts at DRAFT and the server assigns a new invoice number, so the
   * original is untouched.
   */
  const handleDuplicate = async (invoice: any) => {
    if (duplicatingId) return;
    setDuplicatingId(invoice?.id ?? null);
    try {
      const detailRes = await fetch(`/api/invoices/${invoice?.id}`);
      if (!detailRes.ok) {
        toast.error(t('invoices.duplicateLoadFailed'));
        return;
      }
      const full = await detailRes.json();
      const items = (full?.items ?? []).map((item: any) => ({
        description: item?.description ?? '',
        quantity: Number(item?.quantity ?? 0),
        unitPrice: Number(item?.unitPrice ?? 0),
        discount: Number(item?.discount ?? 0),
        taxRate: Number(item?.taxRate ?? 0),
        taxLabel: item?.taxLabel ?? undefined,
      }));

      if (items.length === 0) {
        toast.error(t('invoices.duplicateNoItems'));
        return;
      }

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: full?.customerId,
          issueDate: new Date().toISOString(),
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          currency: full?.currency,
          notes: full?.notes ?? undefined,
          items,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        toast.success(
          created?.invoiceNumber
            ? fill('invoices.duplicated', { number: created.invoiceNumber })
            : t('invoices.duplicatedDraft')
        );
        fetchInvoices();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? t('invoices.duplicateFailed'));
      }
    } catch {
      toast.error(t('invoices.duplicateFailed'));
    } finally {
      setDuplicatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* The actions sit below the heading on a narrow screen rather than
          being pushed off the side of it. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight">{t('invoices.title')}</h1>
          <p className="text-muted-foreground">{t('invoices.subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {/* Sits beside the primary action; the per-invoice "Download PDF"
              lives on the detail page and is untouched. */}
          <BulkPdfButton invoices={invoices} selectedIds={selectedIds} company={company} className="w-full sm:w-auto" />
          <Button asChild className="w-full sm:w-auto">
            <Link href="/invoices/new"><Plus className="w-4 h-4 mr-2" /> {t('invoices.create')}</Link>
          </Button>
        </div>
      </div>

      {invoices.length > 0 ? (
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label={t('bulk.selectAll')}
            id="select-all-invoices"
          />
          <label htmlFor="select-all-invoices" className="cursor-pointer text-muted-foreground">
            {t('bulk.selectAll')}
          </label>
          {selectedIds.length > 0 ? (
            <span className="text-muted-foreground">
              &middot; {fill('bulk.selectedCount', { count: selectedIds.length })}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t('invoices.filterByStatus')} />
          </SelectTrigger>
          <SelectContent>
            {/* The option value is the stored status the API filters on; only
                the label changes with the language. */}
            <SelectItem value="ALL">{t('invoices.allStatuses')}</SelectItem>
            {INVOICE_STATUSES.filter((option) => option.value !== 'VIEWED').map((option) => (
              <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
            ))}
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
            <h3 className="font-medium mb-1">{personalizeEmptyState(t('reports.noInvoices'), company?.name, t('common.emptyStateFor'))}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t('invoices.emptyHint')}</p>
            <Button asChild><Link href="/invoices/new"><Plus className="w-4 h-4 mr-2" /> {t('invoices.create')}</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv: any) => {
            const statusInfo = getStatusBadge(inv?.status ?? 'DRAFT');
            return (
              <Card key={inv?.id} className="hover:shadow-md transition-shadow">
                <CardContent className="py-4">
                  {/* Amount, status and actions drop onto their own line below
                      `sm` instead of squeezing the invoice number out. */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                      <Checkbox
                        checked={selectedIds.includes(inv?.id)}
                        onCheckedChange={() => toggleOne(inv?.id)}
                        aria-label={inv?.invoiceNumber ?? ''}
                      />
                      <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <Link href={`/invoices/${inv?.id}`} className="font-medium hover:text-primary transition-colors">
                          {inv?.invoiceNumber ?? ''}
                        </Link>
                        <p className="text-sm text-muted-foreground">{inv?.customer?.name ?? inv?.customer?.companyName ?? t('invoices.noCustomer')}</p>
                      </div>
                    </div>
                    <div className="flex w-full items-center justify-end gap-3 sm:w-auto sm:gap-4">
                      <div className="text-right">
                        <p className="font-mono font-medium">{formatCurrency(inv?.total ?? 0, inv?.currency ?? 'USD')}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv?.dueDate
                            ? fill('invoices.dueOn', { date: formatCalendarDate(inv.dueDate, 'MMM d, yyyy', intl) })
                            : t('invoices.noDueDate')}
                        </p>
                      </div>
                      <Badge className={statusInfo?.color ?? ''}>{t(statusInfo.labelKey)}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild><Link href={`/invoices/${inv?.id}`}>{t('invoices.viewDetails')}</Link></DropdownMenuItem>
                          {inv?.status === 'DRAFT' && (
                            <DropdownMenuItem onClick={() => handleStatusChange(inv.id, 'SENT')}>
                              <Send className="w-4 h-4 mr-2" /> {t('invoices.markSent')}
                            </DropdownMenuItem>
                          )}
                          {['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv?.status) && (
                            <DropdownMenuItem onClick={() => handleStatusChange(inv.id, 'PAID')}>
                              <CheckCircle className="w-4 h-4 mr-2" /> {t('invoices.markPaid')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem disabled={duplicatingId === inv?.id} onClick={() => handleDuplicate(inv)}>
                            <Copy className="w-4 h-4 mr-2" /> {t('invoices.duplicate')}
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
