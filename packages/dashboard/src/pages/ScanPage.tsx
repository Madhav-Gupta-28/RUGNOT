import { useState } from 'react';
import { SecurityBadge } from '../components/SecurityBadge';
import type { Verdict } from '../lib/types';

const XLAYER_EXAMPLE_TOKENS = [
  { label: 'USDT', address: '0x779ded0c9e1022225f8e0630b35a9b54be713736' },
  { label: 'WOKB', address: '0x75E1AB5E0e3BA13b3520349F069350441CF53c0A' },
  { label: 'WETH', address: '0x5A77f1443D16ee5761d310e38b62f77f726bC71c' },
];

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

export function ScanPage() {
  const [input, setInput] = useState('');
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);

  const handleScan = async (addressOverride?: string) => {
    const address = (addressOverride ?? input).trim();
    if (!address || !/^0x[a-fA-F0-9]{40}$/i.test(address)) {
      setError('Enter a valid 0x token address on X Layer.');
      return;
    }

    setScanState('scanning');
    setVerdict(null);
    setError('');
    const t0 = Date.now();

    try {
      const res = await fetch(`/api/public/scan?token=${encodeURIComponent(address)}`);
      const data = await res.json() as Verdict & { error?: string; message?: string };
      setElapsedMs(Date.now() - t0);

      if (!res.ok) {
        setError(data.message ?? 'Scan failed. Try again.');
        setScanState('error');
        return;
      }

      setVerdict(data);
      setScanState('done');
    } catch {
      setError('Could not reach the RUGNOT API. Is the agent running?');
      setScanState('error');
    }
  };

  const scoreColor = verdict
    ? verdict.level === 'GO'
      ? 'text-accent-safe'
      : verdict.level === 'DANGER'
        ? 'text-accent-danger'
        : 'text-accent-caution'
    : 'text-primary';

  return (
    <div className="mx-auto max-w-3xl mt-4">
      {/* Header */}
      <div className="mb-10 border-b border-[#1a1a1a] pb-6">
        <div className="font-mono text-[10px] tracking-widest uppercase text-secondary mb-2">GUARDIAN SECURITY PIPELINE</div>
        <h1 className="font-sans text-3xl font-bold text-primary tracking-tight">Token Scanner</h1>
        <p className="font-mono text-[11px] text-secondary mt-2">
          Paste any X Layer token address to run the full 5-layer Guardian security check. Free, no wallet needed.
        </p>
      </div>

      {/* Input */}
      <div className="terminal-panel rounded-md p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && void handleScan()}
            placeholder="0x... token contract address on X Layer"
            className="flex-1 bg-[#0a0a0a] border border-[#333333] focus:border-accent-safe outline-none px-4 py-3 font-mono text-xs text-primary placeholder:text-secondary/40 rounded transition"
            disabled={scanState === 'scanning'}
          />
          <button
            onClick={() => void handleScan()}
            disabled={scanState === 'scanning' || !input.trim()}
            className="px-6 py-3 font-mono text-[10px] uppercase tracking-widest font-bold border border-accent-safe text-accent-safe bg-accent-safe/10 hover:bg-accent-safe hover:text-black transition rounded disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {scanState === 'scanning' ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-safe animate-pulse-safe" />
                SCANNING...
              </span>
            ) : 'SCAN TOKEN'}
          </button>
        </div>

        {/* Quick examples */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] text-secondary uppercase tracking-widest">Try:</span>
          {XLAYER_EXAMPLE_TOKENS.map((t) => (
            <button
              key={t.address}
              onClick={() => { setInput(t.address); void handleScan(t.address); }}
              disabled={scanState === 'scanning'}
              className="font-mono text-[9px] text-secondary hover:text-accent-safe border border-[#222] hover:border-accent-safe px-2 py-1 rounded transition disabled:opacity-40"
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 font-mono text-[10px] text-accent-danger uppercase tracking-widest border border-accent-danger/30 bg-accent-danger/10 px-4 py-3 rounded">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Scanning animation */}
      {scanState === 'scanning' && (
        <div className="terminal-panel rounded-md p-8 text-center mb-6">
          <div className="font-mono text-[10px] uppercase tracking-widest text-secondary mb-4">RUNNING GUARDIAN PIPELINE</div>
          <div className="flex justify-center gap-3 mb-4">
            {['Contract Safety', 'Holder Analysis', 'Smart Money', 'Liquidity', 'Tx Simulation'].map((check, i) => (
              <div
                key={check}
                className="w-2 h-2 rounded-full bg-accent-safe animate-pulse-safe"
                style={{ animationDelay: `${i * 0.15}s` }}
                title={check}
              />
            ))}
          </div>
          <div className="font-mono text-[10px] text-secondary/50">5-layer analysis in progress...</div>
        </div>
      )}

      {/* Result */}
      {scanState === 'done' && verdict && (
        <div className="animate-slide-in">
          {/* Verdict header */}
          <div className="terminal-panel rounded-md p-4 sm:p-6 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#1a1a1a]">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-secondary mb-2">SCAN COMPLETE</div>
                <div className="font-mono text-xs text-secondary/70 break-all">{verdict.tokenAddress}</div>
              </div>
              <SecurityBadge level={verdict.level} />
            </div>

            <div className="grid grid-cols-3 gap-6 sm:gap-12">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-secondary mb-2">SCORE</div>
                <div className={`font-mono text-3xl font-light ${scoreColor}`}>{verdict.score}<span className="text-secondary text-lg">/100</span></div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-secondary mb-2">LATENCY</div>
                <div className="font-mono text-3xl font-light text-primary">{verdict.executionTimeMs}ms</div>
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-secondary mb-2">CHAIN</div>
                <div className="font-mono text-3xl font-light text-primary uppercase">{verdict.chain}</div>
              </div>
            </div>
          </div>

          {/* Pipeline checks */}
          <div className="terminal-panel rounded-md p-4 sm:p-6 mb-4">
            <div className="font-mono text-[10px] uppercase tracking-widest text-secondary mb-4">GUARDIAN PIPELINE</div>
            <div className="divide-y divide-[#1a1a1a]">
              {verdict.checks.map((check, idx) => (
                <div key={check.name} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <span className={`font-mono text-[10px] w-5 h-5 flex items-center justify-center rounded-sm ${check.passed ? 'bg-accent-safe/10 text-accent-safe' : 'bg-accent-danger/10 text-accent-danger'}`}>
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-sans text-sm font-bold text-primary uppercase">{check.name}</div>
                      <div className="font-mono text-[10px] text-secondary/70">{check.reason}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase text-secondary mb-1">SCORE</div>
                      <div className="font-mono text-sm text-primary">{check.score}</div>
                    </div>
                    <div className={`font-mono text-[9px] font-bold tracking-widest uppercase px-3 py-1 rounded border w-[4.5rem] text-center ${check.passed ? 'border-accent-safe bg-accent-safe/10 text-accent-safe' : 'border-accent-danger bg-accent-danger/10 text-accent-danger'}`}>
                      {check.passed ? 'PASS' : 'BLOCK'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Verdict summary */}
          <div className={`terminal-panel rounded-md p-4 sm:p-6 mb-6 border ${verdict.level === 'GO' ? 'border-accent-safe/30' : verdict.level === 'DANGER' ? 'border-accent-danger/30' : 'border-accent-caution/30'}`}>
            <div className="font-mono text-[10px] uppercase tracking-widest text-secondary mb-2">RECOMMENDATION</div>
            <div className={`font-sans text-base font-bold ${scoreColor}`}>
              {verdict.level === 'GO' && '✓ Token passed all security checks. Proceed with caution — always do your own research.'}
              {verdict.level === 'CAUTION' && '⚠ Token has some risk signals. Review the failed checks carefully before trading.'}
              {verdict.level === 'DANGER' && '✗ Token failed critical security checks. RUGNOT recommends avoiding this token.'}
            </div>
            <div className="mt-3">
              <a
                href={`https://www.oklink.com/x-layer/token/${verdict.tokenAddress}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] text-secondary hover:text-accent-safe transition underline underline-offset-4"
              >
                View on OKLink Explorer →
              </a>
            </div>
          </div>

          {/* Scan another */}
          <div className="text-center mb-12">
            <button
              onClick={() => { setScanState('idle'); setVerdict(null); setInput(''); }}
              className="font-mono text-[10px] uppercase tracking-widest text-secondary hover:text-primary border border-[#333] hover:border-secondary px-6 py-3 rounded transition"
            >
              ← SCAN ANOTHER TOKEN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
