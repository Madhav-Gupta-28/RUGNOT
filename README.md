# RUGNOT

**The only DeFi agent that won't get you rugged.**

`X Layer` | `Onchain OS` | `Uniswap AI` | `x402` | `MCP`

## What is RUGNOT?

RUGNOT is an autonomous AI DeFi agent for OKX X Layer. It discovers trading opportunities, vets them, executes swaps through the OKX DEX aggregator, and keeps watching every open position after entry.

The core idea is simple: no trade happens without security first. Every candidate token passes through a 5-layer Guardian Pipeline covering contract safety, holder concentration, smart money flow, liquidity depth, and transaction simulation before the agent can buy.

RUGNOT also monitors positions 24/7. If the Sentinel loop detects whale dumping, liquidity pull risk, price crashes, or contract deterioration, the agent can auto-exit before a bad token turns into a full rug. The same security pipeline is exposed as a paid x402 API so other agents can buy safety checks on demand.

## Architecture

```text
LOOP A: DISCOVERY (every 60s)          LOOP B: DEFENSE (every 120s)

  SCOUT --> GUARDIAN --> EXECUTOR       SENTINEL --> AUTO-EXIT
  find       vet each      swap via      monitor       emergency
  signals    candidate     OKX DEX       positions     sell

           SHARED SERVICES
  +-----------+-----------+-----------+------------+
  | StateStore| WS Server | x402 API  | MCP Server |
  | (in-mem)  | dashboard | sell scans| tools      |
  +-----------+-----------+-----------+------------+

           DASHBOARD (React + Vite)
  Chat | Live Feed | Portfolio | Security Log | Economics
```

## Onchain OS Skills Used

| Skill | How RUGNOT uses it |
|---|---|
| okx-security | Token risk scanning, honeypot detection, and transaction simulation. |
| okx-dex-signal | Smart money tracking and whale alerts for entry and exit signals. |
| okx-dex-token | Holder cluster analysis and insider concentration detection. |
| okx-dex-market | Price monitoring, candlestick analysis, and anomaly detection. |
| okx-dex-swap | Trade execution with cross-DEX routing through the OKX aggregator. |
| okx-dex-trenches | New meme token scanning and developer reputation checks. |
| okx-wallet-portfolio | Portfolio monitoring and balance tracking across positions. |
| okx-onchain-gateway | Gas estimation, transaction simulation, broadcast, and order tracking. |
| okx-agentic-wallet | Wallet authentication, token sending, and transaction history. |
| okx-audit-log | Activity export and debugging. |

## Uniswap Skills Used

| Skill | How RUGNOT uses it |
|---|---|
| swap-integration | Swap planning and quote comparison. |
| liquidity-planner | Pool health monitoring and LP lock detection. |
| v4-security-foundations | Smart contract risk assessment for Uniswap v4 hooks. |

## The Guardian Pipeline

```text
[Contract Safety] -> [Holder Analysis] -> [Smart Money] -> [Liquidity] -> [Tx Simulation]
      OK 85               OK 72             WARN 45          OK 90           OK 88

Verdict: GO (score: 74)
```

The five checks combine into a single GO, CAUTION, or DANGER verdict. A hard failure such as a honeypot or blocked sell simulation immediately downgrades the token to DANGER.

## x402 Integration

RUGNOT participates in x402 from both sides of the market.

As a buyer, the agent can pay for premium signal data when it needs stronger discovery inputs. As a seller, it exposes `POST /api/v1/security/check` so external agents can buy security verdicts for $0.005 per check.

That creates an earn-pay-earn loop: trade profits fund signal costs, signal costs improve trade selection, and security revenue funds more agent activity.

## MCP Integration

RUGNOT exposes three MCP tools:

- `check_token_safety` - run the 5-layer Guardian Pipeline for a token.
- `get_portfolio_risks` - vet every token in a wallet or current portfolio.
- `find_safe_opportunities` - return smart money opportunities that passed security checks.

Any Claude Code, Cursor, OpenClaw, or compatible MCP agent can query RUGNOT's security pipeline and use it as a trust layer.

## Deployment

- Chain: X Layer
- Chain ID: 196
- Agent Wallet: [will be filled]
- x402 Endpoint: [will be filled]

## Getting Started

```bash
git clone <repo>
cd rugnot
npm install
cp .env.example .env
# Fill in OKX API credentials for live mode
npm run dev
# Dashboard: http://localhost:5173
# Agent API: http://localhost:3001
# Demo mode: npx tsx scripts/demo-loop.ts
```

## X Layer Mainnet Mode

Live mode uses X Layer mainnet, chain ID `196`, through the OKX DEX Aggregator. The agent wallet must be funded with OKB for gas and USDT for trading. USDT on X Layer is `0x1E4a5963aBFD975d8c9021ce480b42188849D41d`.

To enable live mode, add `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`, `OKX_PROJECT_ID`, `AGENT_WALLET_ADDRESS`, `PRIVATE_KEY`, and `RPC_URL` in `.env`. If credentials are missing or invalid, RUGNOT starts in demo-safe mode and the mock demo endpoint still works.

## Demo Mode

Demo mode keeps the dashboard alive even without OKX credentials or a funded wallet.

```bash
npm run dev
npx tsx scripts/demo-loop.ts
```

The script calls `POST /api/demo/trigger` every 30 seconds. Each trigger generates three mock token scans, one mock buy, one whale-dump threat, one auto-exit, and x402 revenue/spend activity. All events flow through the same StateStore and WebSocket path used by the real agent.

## Team

- Madhav Gupta - Full Stack Developer

## Ecosystem Positioning

RUGNOT makes X Layer safer for AI agents by turning security into shared infrastructure. Instead of every trading agent rebuilding its own rug detection, they can query RUGNOT through x402 or MCP and get a structured verdict before touching a token.

This creates a security-as-a-service layer for the X Layer agent economy. More agents can trade, route, and experiment onchain while depending on a common immune system for token risk, liquidity risk, and emergency exits.

## Screenshots

[Dashboard Screenshot]

[VerdictPipeline Screenshot]

[Threat Detection Screenshot]
