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
    <section className="rounded-xl border border-border bg-bg-surface p-4">
      <div className="mb-4">
        <h2 className="font-sans text-lg font-bold text-primary">x402 Flow</h2>
        <p className="font-sans text-sm text-secondary">Security-check revenue and agent spend.</p>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="#6b6b80" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis stroke="#6b6b80" tickLine={false} axisLine={false} fontSize={12} />
            <Tooltip
              contentStyle={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: 8, color: '#e0e0e0' }}
              formatter={(value) => [`$${Number(value).toFixed(3)}`, 'USDT']}
              labelStyle={{ color: '#6b6b80' }}
            />
            <Bar dataKey="earned" fill="#00ff88" radius={[4, 4, 0, 0]} />
            <Bar dataKey="spent" fill="#ff9500" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
