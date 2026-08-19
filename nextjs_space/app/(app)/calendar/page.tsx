'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, FileText, CreditCard, TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/lib/currencies';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, isSameMonth } from 'date-fns';

interface CalendarEvent {
  id: string;
  type: 'invoice_due' | 'expense_due' | 'payment';
  title: string;
  amount: number;
  currency: string;
  date: Date;
}

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [todayDate, setTodayDate] = useState<Date | null>(null);

  useEffect(() => {
    const now = new Date();
    setCurrentMonth(now);
    setTodayDate(now);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/invoices').then((r: any) => r.json()),
      fetch('/api/expenses').then((r: any) => r.json()),
      fetch('/api/payments').then((r: any) => r.json()),
    ]).then(([invoices, expenses, payments]: any) => {
      const evts: CalendarEvent[] = [];
      for (const inv of (invoices ?? [])) {
        if (inv?.dueDate && ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv?.status)) {
          evts.push({ id: inv.id, type: 'invoice_due', title: `${inv?.invoiceNumber ?? ''} - ${inv?.customer?.name ?? ''}`, amount: inv?.total ?? 0, currency: inv?.currency ?? 'USD', date: new Date(inv.dueDate) });
        }
      }
      for (const exp of (expenses ?? [])) {
        if (exp?.dueDate && exp?.status === 'UNPAID') {
          evts.push({ id: exp.id, type: 'expense_due', title: exp?.description ?? '', amount: exp?.amount ?? 0, currency: exp?.currency ?? 'USD', date: new Date(exp.dueDate) });
        }
      }
      for (const pay of (payments ?? [])) {
        if (pay?.paymentDate) {
          evts.push({ id: pay.id, type: 'payment', title: pay?.invoice?.invoiceNumber ? `Payment: ${pay.invoice.invoiceNumber}` : 'Payment', amount: pay?.amount ?? 0, currency: pay?.currency ?? 'USD', date: new Date(pay.paymentDate) });
        }
      }
      setEvents(evts);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (!currentMonth) {
    return <div className="space-y-6"><div className="h-8 w-48 bg-muted rounded animate-pulse" /><div className="h-96 bg-muted rounded-lg animate-pulse" /></div>;
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  const getEventsForDay = (day: Date) => events.filter((e: CalendarEvent) => isSameDay(e.date, day));
  const selectedEvents = selectedDate ? getEventsForDay(selectedDate) : [];

  const getEventColor = (type: string) => {
    if (type === 'invoice_due') return 'bg-blue-500';
    if (type === 'expense_due') return 'bg-red-500';
    return 'bg-green-500';
  };

  const getEventIcon = (type: string) => {
    if (type === 'invoice_due') return <FileText className="w-4 h-4 text-blue-500" />;
    if (type === 'expense_due') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <CreditCard className="w-4 h-4 text-green-500" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground">See your financial events at a glance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <CardTitle className="text-base">{format(currentMonth, 'MMMM yyyy')}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d: string) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
              {Array.from({ length: startPadding }, (_: any, i: number) => (
                <div key={`pad-${i}`} className="p-2 min-h-[80px]" />
              ))}
              {days.map((day: Date) => {
                const dayEvents = getEventsForDay(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isToday = todayDate ? isSameDay(day, todayDate) : false;
                return (
                  <div
                    key={day.toISOString()}
                    className={`p-2 min-h-[80px] border rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50'
                    } ${isToday ? 'bg-primary/5' : ''}`}
                    onClick={() => setSelectedDate(day)}
                  >
                    <p className={`text-sm ${isToday ? 'font-bold text-primary' : ''}`}>{format(day, 'd')}</p>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 3).map((e: CalendarEvent) => (
                        <div key={e.id} className={`w-full h-1.5 rounded-full ${getEventColor(e.type)}`} />
                      ))}
                      {dayEvents.length > 3 && <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Day Events */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedDate ? format(selectedDate, 'MMM d, yyyy') : 'Select a day'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDate ? (
              <p className="text-sm text-muted-foreground text-center py-4">Click on a day to see events</p>
            ) : selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No events on this day</p>
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((e: CalendarEvent) => (
                  <div key={e.id} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-muted/50">
                    {getEventIcon(e.type)}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{e.type.replace('_', ' ')}</p>
                    </div>
                    <p className="font-mono text-sm font-medium">{formatCurrency(e.amount, e.currency)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex gap-6">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /><span className="text-sm text-muted-foreground">Invoice due</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><span className="text-sm text-muted-foreground">Expense due</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-sm text-muted-foreground">Payment</span></div>
      </div>
    </div>
  );
}
