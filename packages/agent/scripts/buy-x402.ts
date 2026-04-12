import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * ⚡ RUGNOT Premium API Buyer Test ⚡
 */
async function runPaidTest() {
  console.log('\n--- Initiating x402 Buyer Client Native Test ---');
  
  if (process.env.X402_ENABLED !== 'true') {
     console.log('⚠️ WARNING: X402_ENABLED is not "true" in your .env');
     console.log('The Agent will currently return data for free.');
     console.log('To properly test 402 rejections, set X402_ENABLED=true and X402_PAY_TO to your wallet.');
  }

  const agentEndpoint = 'http://localhost:3001/api/v1/security/check';
  const targetToken = '0x0000000000000000000000000000000000000196'; 

  try {
    console.log(`\n[Stage 1] Querying protected endpoint: POST ${agentEndpoint}`);
    
    const response = await fetch(agentEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tokenAddress: targetToken }),
    });

    if (response.status === 402) {
      console.log('✅ Success: Received HTTP 402 Payment Required.');
      console.log('Agent rejected the free request and sent payment instructions.');
      const paymentRequest = response.headers.get('x-payment-request');
      console.log('Payment Request Header:', paymentRequest);
      console.log('\nIn a live environment, a client sdk (like x402-client) would process this header, execute an EVM transaction, and seamlessly re-request the endpoint with an X-PAYMENT header.');
    } else if (response.ok) {
      console.log('✅ Endpoint responded with 200 OK.');
      if (process.env.X402_ENABLED === 'true') {
         console.warn('⚠️ Unexpected! Endpoint returned 200 OK while x402 is enabled. Is X402_PAY_TO missing?');
      }
      const data = await response.json();
      console.log('Verdict Received:\n', data);
    } else {
      console.error(`❌ Request failed with HTTP ${response.status}: ${response.statusText}`);
      console.error(await response.text());
    }

  } catch (err: any) {
    console.error('❌ Network error encountered:', err.message);
  }
}

runPaidTest();
