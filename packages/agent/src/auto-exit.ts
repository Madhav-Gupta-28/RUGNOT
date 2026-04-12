import type { StateStore } from './state.js';
import { executeSell } from './executor.js';
import type { Position, ThreatAlert, TradeExecution, Verdict } from './types.js';

export async function triggerAutoExit(
  state: StateStore,
  position: Position,
  alert: ThreatAlert,
  verdict?: Verdict,
  amountOverride?: number,
): Promise<{ trade: TradeExecution; alert: ThreatAlert }> {
  const trade = await executeSell(position, state, verdict, amountOverride);
  const exitAlert: ThreatAlert = {
    ...alert,
    action: 'auto-exit',
    exitTxHash: trade.txHash || undefined,
  };

  state.emitEvent({
    type: 'exit',
    data: {
      alert: exitAlert,
      trade,
    },
    timestamp: Date.now(),
  });
  state.broadcastState();

  return { trade, alert: exitAlert };
}
