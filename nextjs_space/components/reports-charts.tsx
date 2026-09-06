'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import type { ReportsPayload } from '@/lib/reports-aggregate';

const COLORS = ['#60B5FF', '#FF9149', '#FF9898', '#FF90BB', '#FF6363', '#80D8C3', '#A19AD3', '#72BF78'];

/**
 * The reports charts.
 *
 * These series used to be derived here from the raw income, expense and invoice
 * lists the page had fetched — which meant they inherited that fetch's page
 * limits and drew whatever subset had come back. They now arrive already
 * aggregated by Postgres from /api/reports, so this component only draws.
 *
 * Every Recharts key is unchanged: `month`, `income` and `expenses` on the bar
 * chart, `value` on both pies. Only where the arrays come from is different.
 *
 * Two things the old derivation got wrong, both fixed by the move:
 *   - months were bucketed with a local-time formatter, so a record written at
 *     UTC midnight on the 1st fell into the previous month for any viewer west
 *     of Greenwich. The server buckets in UTC, matching how the column is
 *     written.
 *   - the expense pie added every currency into one set of slices. It is now
 *     grouped per currency, like every other total on the page, and drawn once
 *     per currency exactly as the bar chart already was.
 */
export default function ReportsCharts({ report }: { report: ReportsPayload | null }) {
  const currencies = report?.currencies ?? [];
  const multiCurrency = currencies.length > 1;
  const statusPie = report?.invoiceStatusCounts ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly bar chart — one per currency, never mixing two. */}
      {currencies.map((cur) => {
        // The server returns a gap-free series; the last twelve are drawn.
        const barData = (report?.monthly?.[cur] ?? []).slice(-12);
        return (
          <Card key={cur} className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">
                Income vs Expenses{multiCurrency ? ` (${cur})` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
                      <XAxis dataKey="month" tickLine={false} tick={{ fontSize: 10 }} />
                      <YAxis tickLine={false} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Bar dataKey="income" fill="#60B5FF" radius={[4, 4, 0, 0]} name="Income" />
                      <Bar dataKey="expenses" fill="#FF9149" radius={[4, 4, 0, 0]} name="Expenses" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Expense categories — one pie per currency. */}
      {currencies.map((cur) => {
        const pieData = report?.expenseCategories?.[cur] ?? [];
        return (
          <Card key={cur}>
            <CardHeader>
              <CardTitle className="text-base">
                Expense Categories{multiCurrency ? ` (${cur})` : ''}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pieData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No expenses yet</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                        {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Invoice status — counts, so currency does not apply. */}
      <Card>
        <CardHeader><CardTitle className="text-base">Invoice Status</CardTitle></CardHeader>
        <CardContent>
          {statusPie.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No invoices yet</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPie} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                    {statusPie.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
