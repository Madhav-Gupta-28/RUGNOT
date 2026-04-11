import { agentConfig } from './config.js';
import {
  DEFAULT_SLIPPAGE,
  XLAYER_TOKENS,
  getAggregatorQuote,
  getMarketPriceInfo,
  getSmartMoneyNetFlow,
  getTokenMetadata,
  getTopHolderPercent,
  getTop10HolderPercent,
  toBaseUnits,
} from './okx-api.js';
import type { SecurityCheck, Verdict, VerdictLevel } from './types.js';

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1;
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
  // Layer 1: OKX Aggregator all-tokens metadata (cheap, one round-trip, and
  // gives us isHoneyPot + taxRate for any listed token on X Layer).
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

  // Layer 2: probe the aggregator with a tiny $1 USDT -> token quote. If the
  // router flags isHoneyPot inline, we catch it here. This also doubles as a
  // "can I even route through this token" signal.
  const quote = await getAggregatorQuote({
    fromTokenAddress: XLAYER_TOKENS.USDT,
    toTokenAddress: tokenAddress,
    amount: '1000000', // 1 USDT (6 decimals)
    slippage: '5',
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
  try {
    const [topPct, top1Pct] = await Promise.all([
      getTop10HolderPercent(tokenAddress),
      getTopHolderPercent(tokenAddress),
    ]);
    if (topPct === null) {
      return unavailable('Holder Analysis', 'Holder data unavailable');
    }

    const concentratedWhale = top1Pct !== null && top1Pct >= 35;
    const score = Math.max(0, 100 - topPct - (concentratedWhale ? 25 : 0));
    const reason = top1Pct !== null
      ? `Top holder: ${top1Pct.toFixed(1)}%, top 10 holders: ${topPct.toFixed(1)}%`
      : `Top 10 holders: ${topPct.toFixed(1)}%`;

    return {
      name: 'Holder Analysis',
      passed: topPct < 50 && !concentratedWhale,
      score,
      reason,
      rawData: { top1HolderPercent: top1Pct, top10HolderPercent: topPct },
    };
  } catch (error) {
    console.warn('[Guardian] holder analysis failed:', error);
    return unavailable('Holder Analysis', 'Holder data unavailable');
  }
}

async function checkSmartMoney(tokenAddress: string): Promise<SecurityCheck> {
  try {
    const net = await getSmartMoneyNetFlow(tokenAddress);
    if (net === null) {
      return unavailable('Smart Money', 'Smart money data unavailable');
    }

    return {
      name: 'Smart Money',
      passed: net >= 0,
      score: net > 0 ? 80 : net === 0 ? 50 : 20,
      reason: net > 0 ? `Smart money net-buying $${Math.round(net)}` : net === 0 ? 'Neutral' : `Smart money net-SELLING $${Math.round(Math.abs(net))}`,
      rawData: { netFlowUsd: net },
    };
  } catch (error) {
    console.warn('[Guardian] smart money check failed:', error);
    return unavailable('Smart Money', 'Smart money data unavailable');
  }
}

async function checkLiquidity(tokenAddress: string): Promise<SecurityCheck> {
  const liquidityProbeUsdt = Math.max(1, agentConfig.maxPositionSizeUsdt);
  const [quote, priceInfoArray] = await Promise.all([
    getAggregatorQuote({
      fromTokenAddress: XLAYER_TOKENS.USDT,
      toTokenAddress: tokenAddress,
      amount: toBaseUnits(liquidityProbeUsdt, 6),
      slippage: DEFAULT_SLIPPAGE,
    }),
    getMarketPriceInfo([tokenAddress]).catch(() => []),
  ]);
  const impact = readNumber(quote?.priceImpactPercent ?? quote?.priceImpactPercentage, NaN);

  if (!quote || !Number.isFinite(impact)) {
    return unavailable('Liquidity', 'Quote unavailable');
  }

  const poolLiquidityUsd = readNumber(priceInfoArray[0]?.liquidity, NaN);
  const thinLiquidityPenalty = Number.isFinite(poolLiquidityUsd) && poolLiquidityUsd > 0 && poolLiquidityUsd < 25_000
    ? 40
    : 0;

  const score = Math.max(0, 100 - impact * 10 - thinLiquidityPenalty);
  return {
    name: 'Liquidity',
    passed: impact < 5 && (!Number.isFinite(poolLiquidityUsd) || poolLiquidityUsd >= 10_000),
    score,
    reason: Number.isFinite(poolLiquidityUsd)
      ? `$${liquidityProbeUsdt.toFixed(0)} swap impact: ${impact.toFixed(2)}%, pool liquidity ~$${Math.round(poolLiquidityUsd).toLocaleString()}`
      : `$${liquidityProbeUsdt.toFixed(0)} swap impact: ${impact.toFixed(2)}%`,
    rawData: { quote, poolLiquidityUsd },
  };
}

async function checkSimulation(tokenAddress: string): Promise<SecurityCheck> {
  const quote = await getAggregatorQuote({
    fromTokenAddress: XLAYER_TOKENS.USDT,
    toTokenAddress: tokenAddress,
    amount: '1000000',
    slippage: '5',
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

function isUnavailable(check: SecurityCheck): boolean {
  return check.reason.toLowerCase().includes('unavailable') && check.score === 50;
}

/**
 * Vet a token against the 5-layer security pipeline. The second argument
 * toggles between entry-side and exit-side semantics:
 *
 *   - `context: 'entry'` (default): if every single check came back
 *     unavailable, we return a neutral CAUTION verdict so the caller can skip
 *     the trade safely without false DANGER signals.
 *
 *   - `context: 'exit'`: when re-vetting an open position, the same
 *     all-unavailable situation is DANGEROUS - we have live capital at risk
 *     and lost all our data sources. In this mode we downgrade to DANGER so
 *     the Sentinel loop will auto-exit.
 */
export async function vetToken(
  tokenAddress: string,
  context: 'entry' | 'exit' = 'entry',
): Promise<Verdict> {
  const start = Date.now();
  const checks = await Promise.all([
    checkTokenRisk(tokenAddress),
    checkHolders(tokenAddress),
    checkSmartMoney(tokenAddress),
    checkLiquidity(tokenAddress),
    checkSimulation(tokenAddress),
  ]);

  const allUnavailable = checks.every(isUnavailable);
  if (allUnavailable) {
    const level: VerdictLevel = context === 'exit' ? 'DANGER' : 'CAUTION';
    return {
      tokenAddress,
      chain: 'xlayer',
      level,
      score: context === 'exit' ? 0 : 50,
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
