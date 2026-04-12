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
  const visibleEvents = events.slice(0, 30);

  return (
    <section id="live-feed" className="terminal-panel rounded-xl p-5">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="font-mono text-xs uppercase text-secondary">SECURITY BUS</div>
          <h2 className="mt-2 font-sans text-2xl font-bold text-primary">Live Activity Stream</h2>
          <p className="mt-1 font-sans text-sm text-secondary">Guardian verdicts, trades, exits, and paid security checks.</p>
        </div>
        <span className={`rounded border px-3 py-1 font-mono text-xs ${visibleEvents.length > 0 ? 'border-accent-safe/30 text-accent-safe' : 'border-border text-secondary'}`}>
          {visibleEvents.length > 0 ? 'STREAMING' : 'AWAITING EVENTS'}
        </span>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-dashed border-border bg-bg/50">
          {placeholderRows.map(([time, label, text, chain]) => (
            <div key={label} className="terminal-row grid grid-cols-[4.5rem_5.75rem_1fr] gap-3 px-3 py-4 font-mono text-xs sm:grid-cols-[5rem_7rem_1fr_auto] sm:px-4">
              <span className="text-secondary">{time}</span>
              <span className="rounded border border-border px-2 py-0.5 text-center text-secondary">{label}</span>
              <span className="min-w-0 truncate text-secondary">{text}</span>
              <span className="hidden text-secondary sm:block">{chain}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="max-h-[38rem] overflow-y-auto rounded-xl border border-border bg-bg/40">
          {visibleEvents.map((event, index) => (
            <div
              key={`${event.type}-${event.timestamp}-${index}`}
              className="terminal-row grid grid-cols-[4.75rem_5.75rem_1fr] gap-3 px-3 py-4 animate-slide-in sm:grid-cols-[5.5rem_7rem_1fr_auto] sm:px-4"
            >
              <time className="font-mono text-xs text-secondary">
                {timeAgo(event.timestamp)}
              </time>
              <span className={`rounded border px-2 py-0.5 text-center font-mono text-xs ${getEventTone(event)}`}>
                {getEventLabel(event)}
              </span>
              <p className={`min-w-0 truncate font-mono text-sm ${getEventTextTone(event)}`}>
                {describeEvent(event)}
              </p>
              <span className="hidden font-mono text-xs text-accent-safe sm:block">X LAYER</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
