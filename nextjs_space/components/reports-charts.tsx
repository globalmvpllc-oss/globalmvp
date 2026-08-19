'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';

const COLORS = ['#60B5FF', '#FF9149', '#FF9898', '#FF90BB', '#FF6363', '#80D8C3', '#A19AD3', '#72BF78'];

export default function ReportsCharts({ data, defaultCurrency }: { data: any; defaultCurrency?: string }) {
  const defCur = defaultCurrency || 'USD';

  // Group monthly data by currency to avoid mixing
  const monthlyByCurrency: Record<string, Record<string, { month: string; income: number; expenses: number }>> = {};

  for (const inc of (data?.income ?? [])) {
    if (inc?.status !== 'RECEIVED') continue;
    const cur = inc?.currency || defCur;
    const m = inc?.date ? format(new Date(inc.date), 'MMM yy') : 'Unknown';
    if (!monthlyByCurrency[cur]) monthlyByCurrency[cur] = {};
    if (!monthlyByCurrency[cur][m]) monthlyByCurrency[cur][m] = { month: m, income: 0, expenses: 0 };
    monthlyByCurrency[cur][m].income += Number(inc?.amount) || 0;
  }
  for (const exp of (data?.expenses ?? [])) {
    if (exp?.status !== 'PAID') continue;
    const cur = exp?.currency || defCur;
    const m = exp?.date ? format(new Date(exp.date), 'MMM yy') : 'Unknown';
    if (!monthlyByCurrency[cur]) monthlyByCurrency[cur] = {};
    if (!monthlyByCurrency[cur][m]) monthlyByCurrency[cur][m] = { month: m, income: 0, expenses: 0 };
    monthlyByCurrency[cur][m].expenses += Number(exp?.amount) || 0;
  }

  const chartCurrencies = Object.keys(monthlyByCurrency);

  // Expense categories (with currency label if multi-currency)
  const catData: Record<string, number> = {};
  for (const exp of (data?.expenses ?? [])) {
    const cat = exp?.category ?? 'Other';
    catData[cat] = (catData[cat] ?? 0) + (Number(exp?.amount) || 0);
  }
  const pieData = Object.entries(catData).map(([name, value]) => ({ name, value }));

  // Invoice status distribution
  const statusData: Record<string, number> = {};
  for (const inv of (data?.invoices ?? [])) {
    const s = inv?.status ?? 'DRAFT';
    statusData[s] = (statusData[s] ?? 0) + 1;
  }
  const statusPie = Object.entries(statusData).map(([name, value]) => ({ name, value }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly Bar Chart — one per currency if multi-currency */}
      {(chartCurrencies.length === 0 ? [defCur] : chartCurrencies).map((cur) => {
        const barData = Object.values(monthlyByCurrency[cur] ?? {}).slice(-12);
        return (
          <Card key={cur} className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">
                Income vs Expenses{chartCurrencies.length > 1 ? ` (${cur})` : ''}
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

      {/* Expense Categories */}
      <Card>
        <CardHeader><CardTitle className="text-base">Expense Categories</CardTitle></CardHeader>
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

      {/* Invoice Status */}
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
