# RUGNOT

**The only DeFi agent that won't get you rugged.**

`X Layer` | `OKX DEX Aggregator` | `OKX Market API` | `Gemini Tool Use` | `x402` | `MCP`

## What is RUGNOT?

RUGNOT is an autonomous DeFi security agent for OKX X Layer. It discovers live market signals, vets candidate tokens, executes swaps through the OKX DEX Aggregator, and keeps monitoring every open position after entry.

Every action passes through the Guardian Pipeline, a 5-layer risk engine covering contract safety, holder concentration, smart money flow, liquidity depth, and transaction simulation. A hard failure like a honeypot flag or failed simulation immediately downgrades a token to DANGER.

After entry, the Sentinel loop keeps watching the portfolio. If smart money starts dumping, liquidity gets thin, price breaks down, or the Guardian loses observability on a held token, RUGNOT can pause, alert, or auto-exit before the position turns into a rug.

## Architecture

```text
LOOP A: DISCOVERY (every 60s)          LOOP B: DEFENSE (every 120s)

  SCOUT --> GUARDIAN --> EXECUTOR       SENTINEL --> AUTO-EXIT
  OKX        5 checks      OKX DEX       monitor       emergency
  signals    per token     swap          positions     sell

           SHARED SERVICES
  +-----------+-----------+-----------+------------+------------+
  | StateStore| WS Server | x402 API  | MCP Server | Gemini Chat|
  | JSON disk | dashboard | paid scan | stdio/http | tool use   |
  +-----------+-----------+-----------+------------+------------+

           DASHBOARD (React + Vite)
  Chat | Live Feed | Portfolio | Security Log | Economics
```

## OKX Integrations

| Capability | How RUGNOT uses it |
|---|---|
| OKX DEX Aggregator v6 quote | Live tradeability checks, price quotes, price impact, honeypot/tax metadata. |
| OKX DEX Aggregator v6 swap | Real X Layer swap execution through direct REST quote, approval, swap tx generation, and ethers signing. |
| OKX approval transaction API | ERC-20 approval transaction generation before raw REST swaps. |
| OKX all-tokens metadata | Token symbol, decimals, price, tax, and honeypot metadata for Guardian checks. |
| OKX Market price-info | Portfolio mark prices and market/liquidity context. |
| OKX Market signal list | Smart-money, whale, and KOL signal discovery for Scout. |
| X Layer RPC | OKB gas balance, USDT wallet balance, ERC-20 reads, signing, and broadcast through ethers. |

## The Guardian Pipeline

```text
[Contract Safety] -> [Holder Analysis] -> [Smart Money] -> [Liquidity] -> [Tx Simulation]
      OK 85               OK 72             WARN 45          OK 90           OK 88

Verdict: GO (score: 74)
```

The Guardian returns `GO`, `CAUTION`, or `DANGER`. Entry-side scans skip trades when data is weak. Exit-side scans are stricter: if a held token loses all security visibility, Sentinel treats that as DANGER because live capital is already at risk.

## Gemini Chat

The dashboard chat is backed by Google Gemini through the AI SDK when `GOOGLE_GENERATIVE_AI_API_KEY` is configured. Gemini receives three live tools:

- `check_token_safety` - run the 5-layer Guardian Pipeline for a token.
- `get_portfolio_risks` - re-check every open position.
- `find_safe_opportunities` - discover OKX market signals and return vetted opportunities.

If the API key is absent, the chat falls back to a local state summary instead of pretending to be AI.

## x402 Integration

`POST /api/v1/security/check` uses an in-repo x402 exact EVM implementation that verifies and settles payments through the x402 facilitator. The endpoint sells RUGNOT security verdicts for `$0.005` per check by default.

The protected resource analyzes X Layer tokens, while payment settlement uses x402-supported USDC rails. Default config is Base + USDC through the x402 facilitator:

```env
X402_ENABLED=true
X402_NETWORK=base
X402_PRICE_PER_CHECK=0.005
X402_PAY_TO=0xYourReceivingAddress
X402_FACILITATOR_URL=https://x402.org/facilitator
```

Successful settlements are recorded in the dashboard economics feed as x402 revenue.

## MCP Integration

RUGNOT exposes the same three tools over MCP:

- `check_token_safety`
- `get_portfolio_risks`
- `find_safe_opportunities`

Local clients can run the stdio server with:

```bash
npm run mcp -w @rugnot/agent
```

Hosted clients can use Streamable HTTP at `POST /mcp` when:

```env
ENABLE_MCP=true
MCP_TRANSPORT=http
```

## Deployment

- Chain: X Layer
- Chain ID: `196`
- RPC: `https://rpc.xlayer.tech`
- Gas token: OKB
- Trading token: USDT on X Layer, `0x1E4a5963aBFD975d8c9021ce480b42188849D41d`
- Explorer: `https://www.oklink.com/x-layer`
- x402 settlement: Base USDC by default

## Getting Started

```bash
git clone <repo>
cd rugnot
npm install
cp .env.example .env
# Fill in OKX API credentials, wallet, and GOOGLE_GENERATIVE_AI_API_KEY for live mode
npm run dev
# Dashboard: http://localhost:5173
# Agent API: http://localhost:3001
# Demo mode: npx tsx scripts/demo-loop.ts
```

## X Layer Mainnet Mode

Live mode uses X Layer mainnet through OKX DEX Aggregator v6. The agent wallet must be funded with OKB for gas and USDT for trading.

Required live variables:

```env
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=
OKX_PROJECT_ID=
AGENT_WALLET_ADDRESS=
PRIVATE_KEY=
RPC_URL=https://rpc.xlayer.tech
```

If OKX credentials are missing or invalid, RUGNOT starts in demo-safe mode. If credentials are valid but the wallet has no OKB or USDT, discovery and live swaps stay disabled while the API, dashboard, chat, x402, MCP, and demo route can still run.

## Safety Controls

- `POST /api/pause` stops discovery and Sentinel exits.
- `POST /api/resume` resumes automation.
- Set `ADMIN_TOKEN` to require `x-admin-token` or `Authorization: Bearer <token>` on pause/resume.
- State persists to `STATE_PERSISTENCE_PATH` so verdicts, positions, threats, trades, and x402 economics survive restarts.

## Demo Mode

Demo mode keeps the dashboard alive even without OKX credentials or a funded wallet.

```bash
ENABLE_DEMO=true npm run dev
npx tsx scripts/demo-loop.ts
```

The script calls `POST /api/demo/trigger` every 30 seconds. Each trigger generates three mock token scans, one mock buy, one whale-dump threat, one auto-exit, and x402 revenue/spend activity. All events flow through the same StateStore and WebSocket path used by the real agent.

## Team

- Madhav Gupta - Full Stack Developer

## Ecosystem Positioning

RUGNOT makes X Layer safer for AI agents by turning security into shared infrastructure. Instead of every trading agent rebuilding its own rug detection, agents can query RUGNOT through x402 or MCP and receive a structured verdict before touching a token.

This creates a practical trust layer for the X Layer agent economy: live OKX signals for discovery, Guardian checks before execution, Sentinel monitoring after entry, and paid security checks that other agents can consume.

## Screenshots

[Dashboard Screenshot]

[VerdictPipeline Screenshot]

[Threat Detection Screenshot]
