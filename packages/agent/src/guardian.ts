import {
  DEFAULT_SLIPPAGE,
  XLAYER_TOKENS,
  getAggregatorQuote,
  getTokenMetadata,
  onchainos,
} from './okx-api.js';
import type { SecurityCheck, Verdict, VerdictLevel } from './types.js';

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1;
}

function coerceRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.data) && typeof record.data[0] === 'object' && record.data[0] !== null) {
    return record.data[0] as Record<string, unknown>;
  }
  if (typeof record.result === 'object' && record.result !== null) {
    return record.result as Record<string, unknown>;
  }
  return record;
}

function unavailable(name: string, reason: string): SecurityCheck {
  return {
    name,
    passed: true,
    score: 50,
    reason,
  };
}

async function checkTokenRisk(tokenAddress: string): Promise<SecurityCheck> {
  try {
    const token = await getTokenMetadata(tokenAddress);
    if (token) {
      const isHoneyPot = readBoolean(token.isHoneyPot);
      const taxRate = readNumber(token.taxRate);
      return {
        name: 'Contract Safety',
        passed: !isHoneyPot,
        score: isHoneyPot ? 0 : taxRate > 10 ? 45 : 80,
        reason: isHoneyPot
          ? 'HONEYPOT DETECTED'
          : `Token listed: ${token.tokenSymbol}, tax: ${token.taxRate || '0'}%`,
        rawData: token,
      };
    }
  } catch (error) {
    console.warn('[Guardian] token metadata check failed:', error);
  }

  const cliRisk = coerceRecord(onchainos(`security token-risk --chain xlayer --token-address ${tokenAddress}`));
  if (cliRisk) {
    const isHoneyPot = readBoolean(cliRisk.isHoneyPot ?? cliRisk.honeypot);
    const hasMintFunction = readBoolean(cliRisk.hasMintFunction ?? cliRisk.mintAuthority);
    return {
      name: 'Contract Safety',
      passed: !(isHoneyPot || hasMintFunction),
      score: isHoneyPot ? 0 : hasMintFunction ? 30 : 82,
      reason: isHoneyPot
        ? 'HONEYPOT DETECTED'
        : hasMintFunction
          ? 'Has mint authority'
          : 'Onchain OS token-risk passed',
      rawData: cliRisk,
    };
  }

  const quote = await getAggregatorQuote({
    fromTokenAddress: XLAYER_TOKENS.USDT,
    toTokenAddress: tokenAddress,
    amount: '1000000',
    slippage: '0.05',
  });
  if (quote?.toToken) {
    const isHoneyPot = readBoolean(quote.toToken.isHoneyPot);
    return {
      name: 'Contract Safety',
      passed: !isHoneyPot,
      score: isHoneyPot ? 0 : 80,
      reason: isHoneyPot
        ? 'HONEYPOT DETECTED'
        : `Token tradeable: ${quote.toToken.tokenSymbol}, tax: ${quote.toToken.taxRate || '0'}%`,
      rawData: quote.toToken,
    };
  }

  return unavailable('Contract Safety', 'Security API unavailable - manual review recommended');
}

async function checkHolders(tokenAddress: string): Promise<SecurityCheck> {
  const holders = coerceRecord(onchainos(`dex token holders --chain xlayer --token-address ${tokenAddress}`));
  const topPct = readNumber(
    holders?.top10Percent ?? holders?.top10HolderPercent ?? holders?.topHolderPercent ?? holders?.concentration,
    NaN,
  );

  if (!Number.isFinite(topPct)) {
    return unavailable('Holder Analysis', 'Holder data unavailable');
  }

  return {
    name: 'Holder Analysis',
    passed: topPct < 50,
    score: Math.max(0, 100 - topPct),
    reason: `Top 10 holders: ${topPct.toFixed(1)}%`,
    rawData: holders,
  };
}

async function checkSmartMoney(tokenAddress: string): Promise<SecurityCheck> {
  const flow = coerceRecord(onchainos(`dex signal --chain xlayer --type smart-money --token-address ${tokenAddress}`));
  const net = readNumber(flow?.netBuyAmount ?? flow?.netFlowUsd ?? flow?.netBuyUsd, NaN);

  if (!Number.isFinite(net)) {
    return unavailable('Smart Money', 'Smart money data unavailable');
  }

  return {
    name: 'Smart Money',
    passed: net >= 0,
    score: net > 0 ? 80 : net === 0 ? 50 : 20,
    reason: net > 0 ? 'Smart money buying' : net === 0 ? 'Neutral' : 'Smart money SELLING',
    rawData: flow,
  };
}

async function checkLiquidity(tokenAddress: string): Promise<SecurityCheck> {
  const quote = await getAggregatorQuote({
    fromTokenAddress: XLAYER_TOKENS.USDT,
    toTokenAddress: tokenAddress,
    amount: '100000000',
    slippage: DEFAULT_SLIPPAGE,
  });
  const impact = readNumber(quote?.priceImpactPercent ?? quote?.priceImpactPercentage, NaN);

  if (!quote || !Number.isFinite(impact)) {
    return unavailable('Liquidity', 'Quote unavailable');
  }

  return {
    name: 'Liquidity',
    passed: impact < 5,
    score: Math.max(0, 100 - impact * 10),
    reason: `$100 swap impact: ${impact.toFixed(2)}%`,
    rawData: quote,
  };
}

async function checkSimulation(tokenAddress: string): Promise<SecurityCheck> {
  const quote = await getAggregatorQuote({
    fromTokenAddress: XLAYER_TOKENS.USDT,
    toTokenAddress: tokenAddress,
    amount: '1000000',
    slippage: '0.05',
  });

  if (!quote) {
    return unavailable('Tx Simulation', 'Simulation unavailable');
  }

  const isHoneyPot = readBoolean(quote.toToken?.isHoneyPot);
  const hasOutput = readNumber(quote.toTokenAmount) > 0;
  return {
    name: 'Tx Simulation',
    passed: hasOutput && !isHoneyPot,
    score: !hasOutput || isHoneyPot ? 0 : 88,
    reason: !hasOutput
      ? 'Simulation FAILED: no output'
      : isHoneyPot
        ? 'Simulation FAILED: honeypot flag'
        : 'Quote simulation passed',
    rawData: quote,
  };
}

export async function vetToken(tokenAddress: string): Promise<Verdict> {
  const start = Date.now();
  const checks = await Promise.all([
    checkTokenRisk(tokenAddress),
    checkHolders(tokenAddress),
    checkSmartMoney(tokenAddress),
    checkLiquidity(tokenAddress),
    checkSimulation(tokenAddress),
  ]);

  if (checks.every((check) => check.score === 50 && check.reason.toLowerCase().includes('unavailable'))) {
    return {
      tokenAddress,
      chain: 'xlayer',
      level: 'CAUTION',
      score: 50,
      checks,
      timestamp: Date.now(),
      executionTimeMs: Date.now() - start,
    };
  }

  const avg = checks.reduce((sum, check) => sum + check.score, 0) / checks.length;
  const hasDanger = checks.some((check) => check.score === 0);
  const level: VerdictLevel = hasDanger ? 'DANGER' : avg < 50 ? 'CAUTION' : 'GO';

  return {
    tokenAddress,
    chain: 'xlayer',
    level,
    score: Math.round(hasDanger ? Math.min(avg, 20) : avg),
    checks,
    timestamp: Date.now(),
    executionTimeMs: Date.now() - start,
  };
}
