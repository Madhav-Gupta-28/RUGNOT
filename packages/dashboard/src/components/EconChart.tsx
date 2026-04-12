import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { X402Transaction } from '../lib/types';

interface EconChartProps {
  transactions: X402Transaction[];
}

interface EconPoint {
  label: string;
  earned: number;
  spent: number;
}

function buildData(transactions: X402Transaction[]): EconPoint[] {
  if (transactions.length === 0) {
    return [
      { label: 'T-5', earned: 0.005, spent: 0 },
      { label: 'T-4', earned: 0.01, spent: 0.002 },
      { label: 'T-3', earned: 0.015, spent: 0 },
      { label: 'T-2', earned: 0.02, spent: 0.004 },
      { label: 'T-1', earned: 0.025, spent: 0 },
    ];
  }

  return [...transactions]
    .reverse()
    .slice(-12)
    .map((transaction, index) => ({
      label: `${index + 1}`,
      earned: transaction.direction === 'earned' ? transaction.amount : 0,
      spent: transaction.direction === 'spent' ? transaction.amount : 0,
    }));
}

export function EconChart({ transactions }: EconChartProps) {
  const data = buildData(transactions);

  return (
    <section className="terminal-panel rounded-md p-4 sm:p-6 mb-6">
      <div className="mb-6">
        <h2 className="font-sans text-lg font-bold text-primary mb-1 uppercase tracking-tight">X402 Protocol Flow</h2>
        <p className="font-mono text-[10px] tracking-widest text-secondary uppercase">Security-check revenue vs agent operating costs.</p>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={6}>
            <CartesianGrid stroke="#1a1a1a" vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="label" stroke="#333333" tick={{fill: '#6b6b80', fontSize: 10, fontFamily: 'monospace'}} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="#333333" tick={{fill: '#6b6b80', fontSize: 10, fontFamily: 'monospace'}} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#0a0a0a', border: '1px solid #222222', borderRadius: 4, color: '#f3f4f6', fontFamily: 'monospace', fontSize: '12px' }}
              itemStyle={{ fontWeight: 'bold' }}
              formatter={(value, name) => [`$${Number(value).toFixed(3)}`, name === 'earned' ? 'EARNED' : 'SPENT']}
              labelStyle={{ color: '#9ca3af', marginBottom: '8px' }}
              cursor={{ fill: '#111111' }}
            />
            <Bar dataKey="earned" fill="#bcff2f" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="spent" fill="#4b8dff" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
