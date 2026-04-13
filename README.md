# RUGNOT

**Autonomous defense for X Layer trading agents.**

AI agents can find tokens. RUGNOT is the agent that asks the question most trading bots skip:

> Can this position still be exited safely after it is bought?

Scout discovers live OKX X Layer opportunities. Guardian runs five independent safety checks before capital moves. Executor signs real OKX DEX Aggregator swaps. Sentinel keeps watching every open position and exits only the position that turns dangerous.

No fake backtest. No screenshots-as-proof. Real X Layer transactions, real OKX routes, real wallet state.

`X Layer` · `OKX DEX Aggregator v6` · `OKX Market API` · `Gemini Tool Use` · `x402` · `MCP`


## The Problem

Most on-chain trading agents are optimized for entry.

They scan social momentum, buy fast, and hope risk management catches up later. That is exactly how small wallets get drained:

| Failure mode | What usually happens |
|---|---|
| Honeypot or sell-blocked token | Agent buys because the chart looks alive, then cannot exit. |
| Insider-heavy supply | A few wallets dump after the agent enters. |
| Thin liquidity | The position is technically profitable but impossible to exit cleanly. |
| Stale risk data | A token passes once, then changes behavior after entry. |
| Autonomous execution | The bot keeps trading while the user is asleep. |

The missing primitive is not another alpha bot. It is an autonomous defense layer for agentic DeFi.


## The Solution

RUGNOT is a security-first trading agent for OKX X Layer.

It treats every token as guilty until it passes a live, multi-layer exitability pipeline.

```text
        DISCOVER                 VERIFY                  EXECUTE                 DEFEND

   OKX market signals       Guardian Pipeline       OKX DEX Aggregator       Sentinel loop
   smart money / whale      5 independent checks    signed X Layer swap      re-checks positions
   token discovery          GO / CAUTION / DANGER   ERC-20 approval          selective auto-exit

          │                        │                       │                       │
          ▼                        ▼                       ▼                       ▼
   Candidate token  ─────►  Safety verdict  ─────►  On-chain trade  ─────►  Threat response
```

The core idea is simple:

**Do not enter unless the token can be exited. Do not hold if the exit risk changes.**


## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         RUGNOT AGENT PROCESS                                │
│                                                                              │
│  Loop A: Scout                                                               │
│  ├─ Pull OKX market/signal data                                              │
│  ├─ Build candidate token list                                               │
│  └─ Send each candidate to Guardian                                          │
│                                                                              │
│  Guardian Pipeline                                                           │
│  ├─ Contract safety       honeypot, tax, metadata, sell-risk                 │
│  ├─ Holder analysis       top-holder concentration                           │
│  ├─ Smart money           net buy/sell pressure                              │
│  ├─ Liquidity depth       OKX route + price impact                           │
│  └─ Tx simulation         buy/sell route must be executable                  │
│                                                                              │
│  Executor                                                                    │
│  ├─ Position sizing       max position + portfolio cap                       │
│  ├─ Approval handling     OKX approval transaction API                       │
│  ├─ Swap build            OKX DEX Aggregator v6 swap data                    │
│  ├─ Nonce manager         serialized signer writes                           │
│  └─ Broadcast             ethers wallet on X Layer                           │
│                                                                              │
│  Loop B: Sentinel                                                            │
│  ├─ Re-run Guardian on open positions                                        │
│  ├─ Check price crash, liquidity pull, smart-money dump, contract changes    │
│  └─ Trigger selective auto-exit when risk crosses the threshold              │
│                                                                              │
│  Shared Services                                                             │
│  ├─ StateStore      JSON persistence for positions, verdicts, threats        │
│  ├─ WebSocket       live dashboard stream                                    │
│  ├─ Gemini Chat     tool-using AI analyst                                    │
│  ├─ MCP Server      same tools for external agents                           │
│  └─ x402 API        paid token security checks                               │
└──────────────────────────────────────────────────────────────────────────────┘
```


## Live Mainnet Proof

RUGNOT includes a bounded live proof mode for review and demos. It uses the same execution path as the autonomous agent:

1. Scan curated OKX-listed X Layer tokens.
2. Run the Guardian Pipeline on each candidate.
3. Buy the safest routable candidates with a tiny USDT cap.
4. Stream Scout, Guardian, Executor, Sentinel, and Auto-Exit reasoning.
5. Sell only the position Sentinel selects for exit.
6. Leave remaining positions visible in the Portfolio page.

Recent X Layer proof transactions:

| Action | Token | OKLink |
|---|---:|---|
| Buy | FDOG | [0x7cb9...d843](https://www.oklink.com/x-layer/tx/0x7cb9dcb91cd33bf60eb65ebe96e72806a8f63c8dfa1a7a8363249a837c8cd843) |
| Buy | XDOG | [0x6b19...e0f5](https://www.oklink.com/x-layer/tx/0x6b198d6718c305099d9838fab5b5d0c10689c7527910935326f1fde67e37e0f5) |
| Buy | SEED | [0x01f3...710](https://www.oklink.com/x-layer/tx/0x01f32bb67990d639304bdd42d295121a24da43e07c587654059536faaf8c7710) |
| Sentinel Exit | FDOG | [0x973a...fe02](https://www.oklink.com/x-layer/tx/0x973a257ab1c583e444cb970ad91914a61be5bed009e821ebfa4e7e313f06fe02) |
| Manual Exit | XDOG | [0xc6e1...5983](https://www.oklink.com/x-layer/tx/0xc6e11139d3ec8ba3e49f50d7675508e11e355328f85f40e0f4cfacf01015983a) |

Proof mode is deliberately small by default: `1 USDT`, three buys, one selective exit, and a sub-two-minute monitoring window. The point is to prove the whole lifecycle without risking meaningful funds.


## Guardian Pipeline

Every entry and exit decision flows through Guardian.

```text
Token: XDOG

Contract Safety  ━━━━━━━━━━━━━━━  pass   honeypot/tax metadata acceptable
Holder Analysis  ━━━━━━━━━━━━━    pass   no top-holder concentration failure
Smart Money      ━━━━━━━━━━━      pass   net flow not aggressively negative
Liquidity Depth  ━━━━━━━━━━━━━━━  pass   OKX route can absorb the test size
Tx Simulation    ━━━━━━━━━━━━━━━  pass   buy/sell route builds executable tx

Verdict: GO
```

Guardian outputs:

| Verdict | Meaning |
|---|---|
| `GO` | Token is eligible for a small, capped entry. |
| `CAUTION` | Token is visible but not trusted enough for entry. |
| `DANGER` | Hard block or exit condition. Honeypot, failed simulation, severe concentration, or lost observability on a held position. |

Entry-side behavior is strict: Scout only buys `GO`.

Exit-side behavior is stricter: if a held token loses enough visibility, Sentinel treats that as a defense event because user capital is already exposed.


## Sentinel Defense

Most bots stop thinking after the buy.

RUGNOT keeps checking:

| Threat | What Sentinel watches |
|---|---|
| Whale dump | Smart-money net flow turns negative. |
| Price crash | Position moves against entry or market trend weakens. |
| Liquidity pull | Exit price impact rises above tolerance. |
| Contract change | Guardian verdict deteriorates after entry. |
| Lost visibility | Security data disappears for a held token. |

When a threat trips, Sentinel does not panic-sell the whole wallet. It sells the affected position and leaves the rest of the portfolio intact.


## OKX Integration

RUGNOT is built around live OKX and X Layer infrastructure.

| OKX / X Layer capability | Used for |
|---|---|
| OKX DEX Aggregator v6 quote | Price, route availability, impact checks, buy/sell simulation. |
| OKX DEX Aggregator v6 swap | Real swap transaction generation for X Layer. |
| OKX approval transaction API | ERC-20 allowance flow before aggregator swaps. |
| OKX token metadata | Symbol, decimals, tax, honeypot, and token context. |
| OKX market price-info | Portfolio marks and Sentinel monitoring. |
| OKX market signal list | Scout discovery from live market/smart-money signals. |
| OKX wallet/portfolio endpoints | Balance context and dashboard reconciliation. |
| X Layer RPC | OKB gas reads, ERC-20 balances, nonce, signing, and broadcast. |
| OKLink | Public proof for every executed transaction. |


## AI Agent Chat

The dashboard chat uses Gemini tool calling when `GOOGLE_GENERATIVE_AI_API_KEY` is configured.

Gemini can call real RUGNOT tools:

| Tool | What it does |
|---|---|
| `check_token_safety` | Runs Guardian against any X Layer token address. |
| `get_portfolio_risks` | Re-checks all open positions. |
| `find_safe_opportunities` | Pulls OKX signals and returns vetted opportunities. |

If no Gemini key is configured, the chat falls back to local state summaries instead of pretending to be an LLM.


## x402 Security API

RUGNOT exposes paid security checks for other agents.

```text
POST /api/v1/security/check
```

The protected resource analyzes X Layer tokens. Payment settlement uses x402-supported USDC rails, with Base USDC as the default configuration:

```env
X402_ENABLED=true
X402_NETWORK=base
X402_PRICE_PER_CHECK=0.005
X402_PAY_TO=0xYourReceivingWallet
X402_FACILITATOR_URL=https://x402.org/facilitator
```

This turns RUGNOT from a single-agent dashboard into a reusable security primitive:

```text
Trading agent wants to buy token
        │
        ▼
Pays RUGNOT over x402
        │
        ▼
Receives Guardian verdict
        │
        ▼
Only proceeds if exitability is proven
```


## MCP Integration

The same security tools are available through MCP:

| MCP tool | Purpose |
|---|---|
| `check_token_safety` | Security verdict for a token. |
| `get_portfolio_risks` | Current wallet risk summary. |
| `find_safe_opportunities` | OKX signal discovery and Guardian filtering. |

Local stdio:

```bash
npm run mcp -w @rugnot/agent
```

Hosted Streamable HTTP:

```env
ENABLE_MCP=true
MCP_TRANSPORT=http
```

```text
POST /mcp
```


## Dashboard

The frontend is designed as an operations console, not a marketing page.

| Page | Purpose |
|---|---|
| Scan | Public token safety check. |
| Portfolio | Live wallet exposure, PnL, open positions, manual sell, sell-all. |
| Security | Guardian verdict history and pipeline detail. |
| Economics | x402 revenue/spend loop. |
| System | Scout, Guardian, Executor, Sentinel, Profile, and x402 panels. |
| Chat | Gemini-powered analyst with tool calls. |

The live terminal stream makes agent reasoning visible while it happens: scans, verdicts, route decisions, tx hashes, exits, and failures.


## Safety Controls

RUGNOT is intentionally conservative.

| Control | Why it matters |
|---|---|
| Tiny position caps | Prevents accidental large trades. |
| Portfolio cap | Prevents runaway exposure. |
| Admin token | Protects pause, resume, settings, manual sell, sell-all. |
| Nonce manager | Serializes signer writes across Scout, Sentinel, and manual actions. |
| Fee policy | Normalizes OKX gas fields for ethers/X Layer. |
| Raw balance clamp | Prevents 18-decimal token rounding from overselling by a few wei. |
| State persistence | Keeps verdicts, threats, trades, and positions across restarts. |
| Live proof cooldown | Prevents repeated public triggering. |

Admin endpoints:

```text
POST /api/pause
POST /api/resume
POST /api/settings
POST /api/positions/:token/sell
POST /api/positions/sell-all
```

Set `ADMIN_TOKEN` in production. Requests can use `x-admin-token` or `Authorization: Bearer <token>`.


## Quick Start

```bash
git clone https://github.com/Madhav-Gupta-28/RUGNOT.git
cd RUGNOT

npm install
cp .env.example .env
npm run dev
```

Local URLs:

```text
Dashboard: http://localhost:5173
Agent API: http://localhost:3001
Health:    http://localhost:3001/health
```


## Local Demo Mode

Demo mode uses mock lifecycle events and does not touch funds.

```env
ENABLE_DEMO=true
```

```bash
npm run dev
npx tsx scripts/demo-loop.ts
```


## X Layer Mainnet Mode

Live mode requires a fresh agent wallet funded on X Layer with OKB for gas and USDT for trades.

Minimum environment:

```env
OKX_API_KEY=
OKX_SECRET_KEY=
OKX_PASSPHRASE=
OKX_PROJECT_ID=

AGENT_WALLET_ADDRESS=
PRIVATE_KEY=
AGENT_CHAIN_ID=196
RPC_URL=https://rpc.xlayer.tech

RISK_TOLERANCE=conservative
MAX_POSITION_SIZE_USDT=1
MAX_PORTFOLIO_SIZE_USDT=2
ADMIN_TOKEN=
```

If OKX credentials are invalid, RUGNOT starts in demo-safe mode. If the wallet lacks OKB or USDT, live swaps stay disabled while the dashboard/API can still run.


## Live Proof Mode

Enable only during a review window:

```env
MAINNET_DEMO_ENABLED=true
MAINNET_DEMO_PUBLIC=true
MAINNET_DEMO_CANDIDATES=XDOG:0x0cc24c51bf89c00c5affbfcf5e856c25ecbdb48e,OEOE:0x4c225fb675c0c475b53381463782a7f741d59763,FDOG:0x5839244eab49314bccc0fa76e3a081cb1a461111,DOGSHIT:0x70bf3e2b75d8832d7f790a87fffc1fa9d63dc5bb,SEED:0x375da15dacce7a2a4f8075b5e39b8c2018057777,AI:0x256a55efa042a5e230078df730ffba53f5a77777
MAINNET_DEMO_AMOUNT_USDT=1
MAINNET_DEMO_BUY_COUNT=3
MAINNET_DEMO_MONITOR_MS=55000
MAINNET_DEMO_COOLDOWN_MS=300000
```

The dashboard button runs a bounded mainnet proof cycle. Public mode ignores arbitrary token overrides and uses the configured curated basket.


## Project Structure

```text
rugnot/
├── packages/
│   ├── agent/          Express API, OKX integrations, Guardian, Executor, Sentinel, MCP, x402
│   └── dashboard/      React/Vite dashboard and live operations console
├── scripts/            Local demo and proof helpers
├── .env.example        Mainnet, x402, MCP, and AI configuration
└── README.md
```


## Why RUGNOT Matters

Agentic finance needs more than autonomous buying.

It needs autonomous restraint.

RUGNOT turns token safety into an executable workflow:

```text
discover -> verify -> execute -> monitor -> exit
```

For X Layer, this means safer AI agents, reusable paid security checks, MCP-accessible risk tools, and public OKLink proof that the agent can act on-chain instead of only describing what it would do.


## Team

Madhav Gupta - Full-stack engineer


## Built For

OKX X Layer Arena.

RUGNOT is a security-first agent for the X Layer agent economy: OKX data for discovery, OKX DEX Aggregator for execution, x402 for paid security checks, MCP for agent-to-agent access, and Sentinel defense after every entry.
