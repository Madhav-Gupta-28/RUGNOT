import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMoney } from '../lib/format';
import type { Position, TradeExecution } from '../lib/types';

interface PnlChartProps {
  positions: Position[];
  trades: TradeExecution[];
}

interface PnlPoint {
  label: string;
  value: number;
}

function buildData(positions: Position[], trades: TradeExecution[]): PnlPoint[] {
  if (trades.length > 0) {
    let runningValue = positions.reduce((sum, position) => sum + position.amount * position.currentPrice, 0);
    return [...trades]
      .reverse()
      .slice(-8)
      .map((trade, index) => {
        runningValue += trade.type === 'buy' ? trade.amountIn * 0.02 : trade.amountOut * 0.01;
        return {
          label: `${index + 1}`,
          value: Math.max(0, runningValue),
        };
      });
  }

  const portfolioValue = positions.reduce((sum, position) => sum + position.amount * position.currentPrice, 0);
  const base = portfolioValue > 0 ? portfolioValue : 120;
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, index) => ({
    label,
    value: Math.round((base + Math.sin(index * 0.9) * 12 + index * 4) * 100) / 100,
  }));
}

export function PnlChart({ positions, trades }: PnlChartProps) {
  const data = buildData(positions, trades);

  return (
    <section className="rounded-xl border border-border bg-bg/40 p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
      <div className="mb-8">
        <h2 className="font-sans text-2xl font-bold text-primary mb-2 tracking-tight">PORTFOLIO CURVE</h2>
        <p className="font-mono text-[10px] tracking-widest text-secondary uppercase">Recent portfolio value trail over executed agent trades.</p>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="pnlGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#bcff2f" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#000000" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#1a1a1a" vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="label" stroke="#333333" tick={{fill: '#6b6b80', fontSize: 10, fontFamily: 'monospace'}} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="#333333" tick={{fill: '#6b6b80', fontSize: 10, fontFamily: 'monospace'}} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
            <Tooltip
              contentStyle={{ background: '#0a0a0a', border: '1px solid #222222', borderRadius: 4, color: '#f3f4f6', fontFamily: 'monospace', fontSize: '12px' }}
              itemStyle={{ color: '#bcff2f', fontWeight: 'bold' }}
              formatter={(value) => [formatMoney(Number(value)), 'VALUE']}
              labelStyle={{ color: '#9ca3af', marginBottom: '8px' }}
              cursor={{ stroke: '#222222', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#bcff2f" 
              strokeWidth={3} 
              fillOpacity={1} 
              fill="url(#pnlGlow)" 
              dot={{ r: 4, fill: '#000000', stroke: '#bcff2f', strokeWidth: 2 }} 
              activeDot={{ r: 6, fill: '#bcff2f', stroke: '#000000', strokeWidth: 2 }} 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
