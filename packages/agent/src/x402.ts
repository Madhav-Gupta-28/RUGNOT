import { Router, type NextFunction, type Request, type Response } from 'express';
import { paymentMiddleware, type Network } from 'x402-express';
import { v4 as uuidv4 } from 'uuid';

import { env } from './config.js';
import { vetToken } from './guardian.js';
import type { StateStore } from './state.js';
import type { X402Transaction } from './types.js';

const SUPPORTED_X402_NETWORKS = new Set<string>([
  'base',
  'base-sepolia',
  'polygon',
  'polygon-amoy',
  'avalanche',
  'avalanche-fuji',
  'abstract',
  'abstract-testnet',
  'iotex',
  'solana',
  'solana-devnet',
  'sei',
  'sei-testnet',
  'peaq',
  'story',
  'educhain',
  'skale-base-sepolia',
]);

function isEvmAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function resolveNetwork(): Network {
  if (SUPPORTED_X402_NETWORKS.has(env.x402Network)) {
    return env.x402Network as Network;
  }

  console.warn(`[x402] Unsupported X402_NETWORK=${env.x402Network}; falling back to base.`);
  return 'base';
}

function recordSettledPayment(state: StateStore) {
  return (_req: Request, res: Response, next: NextFunction) => {
    let recorded = false;
    res.on('finish', () => {
      const paymentResponse = res.getHeader('X-PAYMENT-RESPONSE');
      if (recorded || res.statusCode >= 400 || !paymentResponse) {
        return;
      }
      recorded = true;
      const payment: X402Transaction = {
        id: uuidv4(),
        direction: 'earned',
        amount: env.x402PricePerCheck,
        service: `security-check:${env.x402Network}`,
        timestamp: Date.now(),
      };
      state.addX402Transaction(payment);
    });
    next();
  };
}

export function createX402Router(state: StateStore): Router {
  const router = Router();
  const payTo = env.x402PayTo || env.agentWalletAddress;

  if (env.x402Enabled && isEvmAddress(payTo)) {
    router.use(paymentMiddleware(
      payTo,
      {
        'POST /api/v1/security/check': {
          price: `$${env.x402PricePerCheck}`,
          network: resolveNetwork(),
          config: {
            description: 'RUGNOT 5-layer X Layer token security verdict',
            mimeType: 'application/json',
            maxTimeoutSeconds: 60,
            outputSchema: {
              type: 'object',
              properties: {
                tokenAddress: { type: 'string' },
                chain: { type: 'string' },
                level: { type: 'string' },
                score: { type: 'number' },
                checks: { type: 'array' },
              },
            },
          },
        },
      },
      {
        url: env.x402FacilitatorUrl as `${string}://${string}`,
      },
    ));
  } else if (env.x402Enabled) {
    console.warn('[x402] Disabled paid security endpoint because X402_PAY_TO is not a valid EVM address.');
  }

  router.post('/api/v1/security/check', recordSettledPayment(state), async (req, res) => {
    const tokenAddress = typeof req.body?.tokenAddress === 'string' ? req.body.tokenAddress : '';
    const chainId = req.body?.chainId ? String(req.body.chainId) : env.agentChainId;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    if (chainId !== env.agentChainId) {
      return res.status(400).json({ error: `Unsupported chainId ${chainId}. Expected ${env.agentChainId}.` });
    }

    const verdict = await vetToken(tokenAddress);
    state.addVerdict(verdict);
    return res.json(verdict);
  });

  return router;
}
