import { describeEvent, timeAgo } from '../lib/format';
import type { Verdict, WsEvent } from '../lib/types';
import { useRugnotStore } from '../store';

function getEventTone(event: WsEvent): string {
  if (event.type === 'threat' || event.type === 'exit') {
    return 'bg-accent-danger shadow-[0_0_12px_rgba(255,59,59,0.55)]';
  }

  if (event.type === 'x402') {
    return 'bg-accent-caution shadow-[0_0_12px_rgba(255,149,0,0.45)]';
  }

  if (event.type === 'verdict') {
    const data = event.data as Partial<Verdict>;
    if (data.level === 'DANGER') {
      return 'bg-accent-danger shadow-[0_0_12px_rgba(255,59,59,0.55)]';
    }
    if (data.level === 'CAUTION') {
      return 'bg-accent-caution shadow-[0_0_12px_rgba(255,149,0,0.45)]';
    }
  }

  if (event.type === 'state-update') {
    return 'bg-accent-info shadow-[0_0_12px_rgba(59,130,246,0.4)]';
  }

  return 'bg-accent-safe shadow-[0_0_12px_rgba(0,255,136,0.5)]';
}

export function LiveFeed() {
  const events = useRugnotStore((store) => store.events);
  const visibleEvents = events.slice(0, 30);

  return (
    <section className="rounded-xl border border-border bg-bg-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-sans text-lg font-bold text-primary">Live Feed</h2>
          <p className="font-sans text-sm text-secondary">Security verdicts, trades, exits, and x402 activity.</p>
        </div>
        <span className="rounded-full border border-accent-safe/30 px-2 py-1 font-mono text-xs text-accent-safe">
          LIVE
        </span>
      </div>

      {visibleEvents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-bg/60 p-8 text-center">
          <p className="font-sans text-sm text-secondary">
            No live events yet. Start the agent backend and this stream will light up as scans land.
          </p>
        </div>
      ) : (
        <div className="max-h-[36rem] overflow-y-auto pr-1">
          {visibleEvents.map((event, index) => (
            <div
              key={`${event.type}-${event.timestamp}-${index}`}
              className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-bg-surface p-3 animate-slide-in"
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${getEventTone(event)}`} />
              <p className="min-w-0 flex-1 truncate font-sans text-sm text-primary">
                {describeEvent(event)}
              </p>
              <time className="shrink-0 font-mono text-xs text-secondary">
                {timeAgo(event.timestamp)}
              </time>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
