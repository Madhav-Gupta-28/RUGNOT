import type { TradeExecution, Verdict, WsEvent, X402Transaction } from './types';

export function truncateAddress(address: string, left = 6, right = 4): string {
  if (!address) {
    return '0x0000...0000';
  }
  if (address.length <= left + right + 3) {
    return address;
  }
  return `${address.slice(0, left)}...${address.slice(-right)}`;
}

export function formatMoney(value: number, precision = 2): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}`;
}

export function formatTokenAmount(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (Math.abs(value) >= 1) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

export function timeAgo(timestamp: number): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 5) {
    return 'now';
  }
  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return `${Math.floor(diffHours / 24)}d ago`;
}

export function tokenLabel(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return 'TOKEN';
  }
  const record = data as Record<string, unknown>;
  const symbol = record.tokenSymbol;
  const address = record.tokenAddress;
  if (typeof symbol === 'string' && symbol.length > 0) {
    return symbol;
  }
  if (typeof address === 'string' && address.length > 0) {
    return truncateAddress(address);
  }
  return 'TOKEN';
}

function isVerdict(data: unknown): data is Verdict {
  return typeof data === 'object' && data !== null && 'level' in data && 'score' in data;
}

function isTrade(data: unknown): data is TradeExecution {
  return typeof data === 'object' && data !== null && 'type' in data && 'amountIn' in data;
}

function isX402(data: unknown): data is X402Transaction {
  return typeof data === 'object' && data !== null && 'direction' in data && 'amount' in data && 'service' in data;
}

export function describeEvent(event: WsEvent): string {
  if (event.type === 'verdict' && isVerdict(event.data)) {
    return `Scanned ${tokenLabel(event.data)} - ${event.data.level} (score: ${event.data.score})`;
  }

  if (event.type === 'trade' && isTrade(event.data)) {
    const verb = event.data.type === 'buy' ? 'Bought' : 'Sold';
    return `${verb} ${formatTokenAmount(event.data.amountIn)} USDT of ${tokenLabel(event.data)}`;
  }

  if (event.type === 'threat') {
    const record = typeof event.data === 'object' && event.data !== null ? event.data as Record<string, unknown> : {};
    const threatType = typeof record.threatType === 'string'
      ? record.threatType.replace(/-/g, ' ')
      : 'Threat';
    return `${threatType.charAt(0).toUpperCase()}${threatType.slice(1)} detected on ${tokenLabel(event.data)}`;
  }

  if (event.type === 'exit') {
    const record = typeof event.data === 'object' && event.data !== null ? event.data as Record<string, unknown> : {};
    const alert = typeof record.alert === 'object' && record.alert !== null ? record.alert : event.data;
    const trade = typeof record.trade === 'object' && record.trade !== null ? record.trade as Record<string, unknown> : {};
    const amountOut = typeof trade.amountOut === 'number' ? trade.amountOut : 0;
    return `Auto-exited ${tokenLabel(alert)} - saved ${formatMoney(amountOut, 0)}`;
  }

  if (event.type === 'x402' && isX402(event.data)) {
    const verb = event.data.direction === 'earned' ? 'Earned' : 'Spent';
    return `${verb} $${event.data.amount.toFixed(3)} from ${event.data.service.replace(/-/g, ' ')}`;
  }

  return 'State refreshed';
}

export function scoreTone(score: number): 'safe' | 'caution' | 'danger' {
  if (score >= 70) {
    return 'safe';
  }
  if (score >= 30) {
    return 'caution';
  }
  return 'danger';
}
