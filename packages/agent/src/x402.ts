import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { env } from './config.js';
import { vetToken } from './guardian.js';
import type { StateStore } from './state.js';
import type { X402Transaction } from './types.js';

function hasPaymentProof(headers: Record<string, string | string[] | undefined>): boolean {
  const direct = headers['x402-payment'];
  const alternate = headers['x-payment-proof'];
  const auth = headers.authorization;

  if (typeof direct === 'string' && direct.trim().length > 0) {
    return true;
  }
  if (typeof alternate === 'string' && alternate.trim().length > 0) {
    return true;
  }
  return typeof auth === 'string' && auth.toLowerCase().startsWith('x402 ');
}

export function createX402Router(state: StateStore): Router {
  const router = Router();

  router.post('/api/v1/security/check', async (req, res) => {
    const tokenAddress = typeof req.body?.tokenAddress === 'string' ? req.body.tokenAddress : '';
    const chainId = req.body?.chainId ? String(req.body.chainId) : env.agentChainId;

    if (!tokenAddress) {
      return res.status(400).json({ error: 'tokenAddress is required' });
    }

    if (chainId !== env.agentChainId) {
      return res.status(400).json({ error: `Unsupported chainId ${chainId}. Expected ${env.agentChainId}.` });
    }

    if (!hasPaymentProof(req.headers)) {
      return res.status(402).json({
        error: 'x402_payment_required',
        service: 'security-check',
        amount: env.x402PricePerCheck,
        asset: 'USDT',
        chainId: env.agentChainId,
        instructions: 'Provide x402-payment, x-payment-proof, or Authorization: x402 <proof> header.',
      });
    }

    const verdict = await vetToken(tokenAddress);
    state.addVerdict(verdict);

    const payment: X402Transaction = {
      id: uuidv4(),
      direction: 'earned',
      amount: env.x402PricePerCheck,
      service: 'security-check',
      timestamp: Date.now(),
    };

    state.addX402Transaction(payment);
    return res.json(verdict);
  });

  return router;
}
