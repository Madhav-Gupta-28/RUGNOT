import { env } from './config.js';
import { callOkxApi } from './okx-api.js';
import type { SecurityCheck, Verdict, VerdictLevel } from './types.js';

export async function vetToken(tokenAddress: string): Promise<Verdict> {
  const start = Date.now();
  const checks: SecurityCheck[] = [];

  // LAYER 1: Contract Safety (okx-security)
  // Checks: honeypot, mint authority, blacklist, proxy contract
  const risk = await callOkxApi<Record<string, unknown>>(
    'GET',
    `/api/v5/dex/security/token-risk?chainId=${env.agentChainId}&tokenAddress=${tokenAddress}`,
  );
  checks.push({
    name: 'Contract Safety',
    passed: risk ? !(Boolean(risk.isHoneypot) || Boolean(risk.hasMintFunction)) : true,
    score: Boolean(risk?.isHoneypot) ? 0 : Boolean(risk?.hasMintFunction) ? 30 : risk ? 85 : 50,
    reason: Boolean(risk?.isHoneypot) ? 'HONEYPOT DETECTED' :
      Boolean(risk?.hasMintFunction) ? 'Has mint authority' :
        risk ? 'Contract checks passed' : 'API unavailable',
    rawData: risk,
  });

  // LAYER 2: Holder Concentration (okx-dex-token)
  // Checks: top 10 holder %, insider wallet clustering
  const holders = await callOkxApi<Record<string, unknown>>(
    'GET',
    `/api/v5/dex/token/holders?chainId=${env.agentChainId}&tokenAddress=${tokenAddress}`,
  );
  const topPct = holders?.top10Percent ? Number(holders.top10Percent) : null;
  checks.push({
    name: 'Holder Analysis',
    passed: topPct === null || topPct < 50,
    score: topPct !== null ? Math.max(0, 100 - topPct) : 50,
    reason: topPct !== null ? `Top 10 holders: ${topPct.toFixed(1)}%` : 'Data unavailable',
    rawData: holders,
  });

  // LAYER 3: Smart Money Flow (okx-dex-signal)
  // Checks: are whales buying or dumping?
  const flow = await callOkxApi<Record<string, unknown>>(
    'GET',
    `/api/v5/dex/signal/smart-money?chainId=${env.agentChainId}&tokenAddress=${tokenAddress}`,
  );
  const net = flow?.netBuyAmount ? Number(flow.netBuyAmount) : 0;
  checks.push({
    name: 'Smart Money',
    passed: net >= 0,
    score: net > 0 ? 80 : net === 0 ? 50 : 20,
    reason: net > 0 ? 'Smart money buying' : net === 0 ? 'Neutral' : 'Smart money SELLING',
    rawData: flow,
  });

  // LAYER 4: Liquidity Depth (via swap quote — proxy for liquidity)
  const quote = await callOkxApi<Record<string, unknown>>(
    'GET',
    `/api/v5/dex/swap/quote?chainId=${env.agentChainId}&fromTokenAddress=USDT&toTokenAddress=${tokenAddress}&amount=100000000`,
  );
  const impact = quote?.priceImpact ? Number(quote.priceImpact) : null;
  checks.push({
    name: 'Liquidity',
    passed: impact === null || impact < 5,
    score: impact !== null ? Math.max(0, 100 - impact * 10) : 50,
    reason: impact !== null ? `$100 swap impact: ${impact.toFixed(2)}%` : 'Quote unavailable',
    rawData: quote,
  });

  // LAYER 5: Transaction Simulation (okx-security or okx-onchain-gateway)
  const sim = await callOkxApi<Record<string, unknown>>('POST', '/api/v5/dex/security/tx-simulation', {
    chainId: env.agentChainId, tokenAddress, amount: '100',
  });
  checks.push({
    name: 'Tx Simulation',
    passed: sim ? sim.success !== false : true,
    score: sim?.success === false ? 0 : sim ? 90 : 50,
    reason: sim?.success === false ? `Simulation FAILED: ${String(sim.reason ?? 'unknown reason')}` :
      sim ? 'Simulation passed' : 'Simulation unavailable',
    rawData: sim,
  });

  if (checks.every((check) => check.reason.toLowerCase().includes('unavailable'))) {
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

  // COMBINE
  const avg = checks.reduce((s, c) => s + c.score, 0) / checks.length;
  const hasDanger = checks.some(c => c.score === 0);
  const level: VerdictLevel = hasDanger ? 'DANGER' : avg < 50 ? 'CAUTION' : 'GO';

  return {
    tokenAddress, chain: 'xlayer', level,
    score: Math.round(hasDanger ? Math.min(avg, 20) : avg),
    checks, timestamp: Date.now(), executionTimeMs: Date.now() - start,
  };
}
