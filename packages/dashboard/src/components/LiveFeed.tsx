import { describeEvent, timeAgo } from '../lib/format';
import type { Verdict, WsEvent } from '../lib/types';
import { useRugnotStore } from '../store';

const placeholderRows = [
  ['--:--:--', 'SCOUT', 'Awaiting OKX market signal', 'X LAYER'],
  ['--:--:--', 'GUARDIAN', 'Awaiting five-layer verdict', 'PIPELINE'],
  ['--:--:--', 'SENTINEL', 'Awaiting open position telemetry', 'DEFENSE'],
];

function getEventTone(event: WsEvent): string {
  if (event.type === 'threat' || event.type === 'exit') {
    return 'border-accent-danger/35 bg-accent-danger/10 text-accent-danger';
  }

  if (event.type === 'x402') {
    return 'border-accent-caution/35 bg-accent-caution/10 text-accent-caution';
  }

  if (event.type === 'verdict') {
    const data = event.data as Partial<Verdict>;
    if (data.level === 'DANGER') {
      return 'border-accent-danger/35 bg-accent-danger/10 text-accent-danger';
    }
    if (data.level === 'CAUTION') {
      return 'border-accent-caution/35 bg-accent-caution/10 text-accent-caution';
    }
  }

  if (event.type === 'state-update') {
    return 'border-accent-info/35 bg-accent-info/10 text-accent-info';
  }

  return 'border-accent-safe/35 bg-accent-safe/10 text-accent-safe';
}

function getEventLabel(event: WsEvent): string {
  if (event.type === 'state-update') {
    return 'STATE';
  }
  return event.type.toUpperCase();
}

function getEventTextTone(event: WsEvent): string {
  if (event.type === 'threat' || event.type === 'exit') {
    return 'text-accent-danger';
  }
  if (event.type === 'x402') {
    return 'text-accent-caution';
  }
  if (event.type === 'trade') {
    return 'text-accent-safe';
  }
  if (event.type === 'verdict') {
    const data = event.data as Partial<Verdict>;
    if (data.level === 'DANGER') return 'text-accent-danger';
    if (data.level === 'CAUTION') return 'text-accent-caution';
    return 'text-accent-safe';
  }
  return 'text-primary';
}

export function LiveFeed() {
  const events = useRugnotStore((store) => store.events);
  // Filter out state-update noise — these fire on every heartbeat and clutter the feed.
  // Judges should see meaningful events: trades, verdicts, threats, exits, x402.
  const meaningfulEvents = events.filter((e) => e.type !== 'state-update');
  const visibleEvents = meaningfulEvents.slice(0, 30);

  return (
    <section id="live-feed" className="terminal-panel rounded-md p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="font-mono text-[10px] tracking-widest uppercase text-secondary">SECURITY BUS</div>
          <h2 className="mt-2 font-sans text-2xl font-bold text-primary">Live Activity Stream</h2>
          <p className="mt-1 font-sans text-sm text-secondary">Guardian verdicts, trades, exits, and paid security checks.</p>
        </div>
        <span className={`rounded border px-3 py-1 font-mono text-[10px] tracking-widest uppercase ${visibleEvents.length > 0 ? 'border-accent-safe/30 text-accent-safe bg-accent-safe/5' : 'border-border text-secondary'}`}>
          {visibleEvents.length > 0 ? 'STREAMING' : 'AWAITING EVENTS'}
        </span>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="overflow-hidden rounded border border-dashed border-border bg-bg/50">
          {placeholderRows.map(([time, label, text, chain]) => (
            <div key={label} className="border-b border-border last:border-0 grid grid-cols-[4.5rem_5.75rem_1fr] gap-3 px-3 py-4 font-mono text-xs sm:grid-cols-[5rem_7rem_1fr_auto] sm:px-4">
              <span className="text-secondary">{time}</span>
              <span className="rounded border border-border px-2 py-0.5 text-center text-secondary">{label}</span>
              <span className="min-w-0 truncate text-secondary">{text}</span>
              <span className="hidden text-secondary sm:block">{chain}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="max-h-[38rem] overflow-y-auto rounded border border-[#1a1a1a] bg-[#050505]">
          {visibleEvents.map((event, index) => {
            let txUrl: string | undefined;
            // Trade events: link the tx hash
            if (event.type === 'trade' && typeof event.data === 'object' && event.data !== null && 'txHash' in event.data) {
              const hash = event.data.txHash as string;
              if (hash && /^0x[a-fA-F0-9]{64}$/.test(hash)) {
                txUrl = `https://www.oklink.com/x-layer/tx/${hash}`;
              }
            }
            // Exit events: link via the nested trade's txHash
            if (event.type === 'exit' && typeof event.data === 'object' && event.data !== null) {
              const rec = event.data as Record<string, unknown>;
              const trade = rec.trade as Record<string, unknown> | undefined;
              const hash = trade?.txHash as string | undefined;
              if (hash && /^0x[a-fA-F0-9]{64}$/.test(hash)) {
                txUrl = `https://www.oklink.com/x-layer/tx/${hash}`;
              }
            }

            return (
              <div
                key={`${event.type}-${event.timestamp}-${index}`}
                className="border-b border-border last:border-0 hover:bg-[#0a0a0a] transition-colors grid grid-cols-[4.75rem_5.75rem_1fr] items-center gap-3 px-3 py-2.5 animate-slide-in sm:grid-cols-[5.5rem_7rem_1fr_auto] sm:px-4"
              >
                <time className="font-mono text-[10px] text-secondary">
                  {timeAgo(event.timestamp)}
                </time>
                <span className={`rounded border px-2 py-0.5 text-center font-mono text-[9px] font-bold tracking-wider ${getEventTone(event)}`}>
                  {getEventLabel(event)}
                </span>
                {txUrl ? (
                  <a href={txUrl} target="_blank" rel="noreferrer" className={`min-w-0 truncate font-mono text-xs hover:underline cursor-pointer flex items-center gap-1.5 ${getEventTextTone(event)}`}>
                    {describeEvent(event)}
                    <span className="opacity-50 text-[10px]">↗</span>
                  </a>
                ) : (
                  <p className={`min-w-0 truncate font-mono text-xs ${getEventTextTone(event)}`}>
                    {describeEvent(event)}
                  </p>
                )}
                <span className="hidden font-mono text-[9px] tracking-widest text-accent-safe sm:block pt-[1px]">X LAYER</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
