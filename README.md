# RUGNOT

**Autonomous defense for X Layer trading agents.**

AI agents are getting good at finding tokens. They are still bad at asking the question that matters after entry:

> Can this token still be sold safely when risk changes?

RUGNOT is a security-first agent for OKX X Layer. It discovers live market opportunities, runs every candidate through a five-layer Guardian risk pipeline, executes real swaps through the OKX DEX Aggregator, and keeps monitoring open positions with Sentinel until they are safe or selectively exited.

No fake backtest. No screenshots-as-proof. Real X Layer wallet. Real OKX routes. Real on-chain transactions.

`X Layer` · `OKX Onchain OS skills` · `OKX DEX Aggregator v6` · `Gemini tool calling` · `x402` · `MCP`


## Submission Snapshot

| Requirement | RUGNOT implementation |
|---|---|
| Built on X Layer | Agent wallet, OKB gas reads, USDT balance reads, ERC-20 approvals, and OKX DEX swaps all run on X Layer mainnet, chain `196`. |
| Agentic Wallet identity | `0x4aa3af8c732a19ec9534fb56316497215e52fc3c` on X Layer. |
| Onchain OS / Uniswap skill usage | Uses OKX Onchain OS-style modules for DEX swap, security, market signals, token holders, token market data, and wallet portfolio. No Uniswap skills are claimed. |
| Public GitHub repo | [github.com/Madhav-Gupta-28/RUGNOT](https://github.com/Madhav-Gupta-28/RUGNOT) |
| Deployment / on-chain address | X Layer Agentic Wallet: [0x4aa3...fc3c](https://www.oklink.com/x-layer/address/0x4aa3af8c732a19ec9534fb56316497215e52fc3c) |
| Working mechanics | Scout -> Guardian -> Executor -> Sentinel -> Auto-Exit, with live WebSocket reasoning and OKLink transaction links. |
| Team | Madhav Gupta, full-stack engineer. |
| X Layer positioning | A reusable defense layer for the X Layer agent economy: trade safety before entry, risk monitoring after entry, paid checks through x402, and MCP tools for other agents. |


## Why RUGNOT Exists

Most trading agents optimize for buying.

That creates a dangerous gap:

| Risk | What a normal bot does | What RUGNOT does |
|---|---|---|
| Honeypot | Buys because momentum looks strong. | Blocks if contract/tax/simulation layers fail. |
| Insider-heavy supply | Enters before whales dump. | Scores holder concentration and smart-money flow. |
| Thin liquidity | Marks profit that cannot be realized. | Probes route depth and price impact before entry and during monitoring. |
| Risk changes after buy | Keeps holding until manual intervention. | Sentinel re-runs security checks on every open position. |
| Agent autonomy | Can compound mistakes while unattended. | Enforces position caps, portfolio caps, pause/resume, manual sell, sell-all, and selective auto-exit. |

The core primitive is simple:

```text
Do not enter unless exitability is proven.
Do not keep holding if exitability deteriorates.
```


## What It Does

RUGNOT is one coordinated agent runtime with role-specialized modules. The README calls them agents because they act like separate operational roles, but they share one state store and one Agentic Wallet identity.

| Role | Responsibility | Evidence in code |
|---|---|---|
| Scout | Finds live OKX X Layer market opportunities and filters them by signal strength. | `packages/agent/src/scout.ts`, `packages/agent/src/okx-api.ts` |
| Guardian | Produces `GO`, `CAUTION`, or `DANGER` from five independent risk checks. | `packages/agent/src/guardian.ts` |
| Executor | Sizes positions, requests OKX approvals/swaps, signs, broadcasts, and records trades. | `packages/agent/src/executor.ts` |
| Sentinel | Re-checks open positions and identifies whale dumps, price crashes, liquidity pulls, and contract risk changes. | `packages/agent/src/sentinel.ts` |
| Auto-Exit | Sells only the affected position when Sentinel escalates. | `packages/agent/src/auto-exit.ts` |
| Analyst | Gemini-powered chat that can call RUGNOT tools instead of giving generic answers. | `packages/agent/src/llm.ts`, `packages/agent/src/routes.ts` |
| Security API | Exposes paid Guardian checks over x402 and agent-to-agent tools over MCP. | `packages/agent/src/x402.ts`, `packages/agent/src/mcp.ts` |


## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                               RUGNOT                                         │
│                                                                              │
│  X Layer Agentic Wallet                                                      │
│  0x4aa3af8c732a19ec9534fb56316497215e52fc3c                                  │
│                                                                              │
│  LOOP A: DISCOVERY                                                           │
│  ├─ Scout pulls OKX signals, token data, and route context                    │
│  ├─ Guardian scores every candidate                                          │
│  └─ Executor buys only candidates that pass the risk floor                    │
│                                                                              │
│  LOOP B: DEFENSE                                                             │
│  ├─ Sentinel monitors open positions                                         │
│  ├─ Guardian re-runs checks after entry                                      │
│  └─ Auto-Exit sells the one position that crosses threat rules                │
│                                                                              │
│  SHARED SERVICES                                                             │
│  ├─ StateStore       persisted JSON state                                    │
│  ├─ WebSocket        live dashboard reasoning stream                         │
│  ├─ Gemini Chat      AI tool-use interface                                   │
│  ├─ MCP              check_token_safety, get_portfolio_risks, opportunities  │
│  └─ x402             paid security-check endpoint                            │
│                                                                              │
│  DASHBOARD                                                                    │
│  ├─ Scan       public token safety checks                                    │
│  ├─ Portfolio  wallet exposure, trade ledger, manual sell, sell-all          │
│  ├─ Security   Guardian pipeline and verdict history                         │
│  ├─ System     Scout, Guardian, Executor, Sentinel, Profile, x402 panels     │
│  ├─ Economics  x402 revenue/spend loop                                       │
│  └─ Chat       Gemini analyst connected to live tools                        │
└──────────────────────────────────────────────────────────────────────────────┘
```


## Working Mechanics

### 1. Scout discovers candidates

Scout pulls live OKX Market API signals from X Layer: smart-money, KOL, whale, volume, and market metadata. Sell-side signals are ignored as buy opportunities. Buy-side signal strength is scored from USD size and wallet agreement.

```text
OKX signal/list -> normalize token -> derive signalStrength -> candidate queue
```

### 2. Guardian runs five checks

Every candidate passes through the Guardian Pipeline:

| Check | What it verifies | Failure behavior |
|---|---|---|
| Contract Safety | Honeypot/tax/token metadata and route sanity. | Hard block on dangerous metadata. |
| Holder Analysis | Top holder and top-10 concentration. | Downgrades concentrated tokens. |
| Smart Money | Net smart-money buy/sell pressure. | Warns or blocks aggressive selling. |
| Liquidity Depth | OKX route depth and price impact at the configured position size. | Blocks poor exitability. |
| Tx Simulation | Buy/sell route can be built through OKX Aggregator. | Hard block if execution cannot be proven. |

Guardian output:

```text
GO       token can be entered under caps
CAUTION  visible, but not safe enough for entry
DANGER   block entry or exit if already held
```

### 3. Executor trades on X Layer

Executor uses the OKX DEX Aggregator v6 flow:

```text
quote -> approval transaction -> swap transaction -> ethers signer -> X Layer broadcast -> OKLink proof
```

It also includes production safety handling:

| Safety layer | Purpose |
|---|---|
| Nonce manager | Serializes Scout, Sentinel, manual sell, and proof-cycle writes through one wallet. |
| Fee policy | Normalizes OKX gas fields and fixes X Layer EIP-1559 edge cases. |
| Raw balance clamp | Prevents 18-decimal token rounding from overselling by a few wei. |
| Position caps | Limits max position and max total portfolio exposure. |
| Admin controls | Pause, resume, settings, manual sell, and sell-all require `ADMIN_TOKEN` in production. |

### 4. Sentinel defends after entry

Sentinel runs on open positions and looks for:

| Threat | Trigger |
|---|---|
| Whale dump | Smart-money flow turns negative. |
| Price crash | Live mark falls against entry or 24h market trend weakens. |
| Liquidity pull | Exit price impact rises above tolerance. |
| Contract change | Guardian verdict deteriorates after entry. |
| Lost observability | Security checks become unavailable for a held position. |

If one token trips risk, Sentinel sells that token only. It does not blindly liquidate the whole wallet.


## Onchain OS / Uniswap Skill Usage

RUGNOT intentionally focuses on OKX Onchain OS and X Layer. It does not claim a Uniswap integration in this submission.

| Skill / core module | How RUGNOT uses it | Code evidence |
|---|---|---|
| `okx-dex-swap` | Builds quotes, approval txs, swap txs, and broadcasts swaps through the agent wallet. | `packages/agent/src/executor.ts`, `packages/agent/src/okx-api.ts` |
| `okx-security` | Powers contract safety, honeypot/tax checks, and buy/sell execution simulation inside Guardian. | `packages/agent/src/guardian.ts` |
| `okx-dex-signal` | Reads OKX market signal streams for smart-money, whale, and KOL discovery. | `packages/agent/src/okx-api.ts`, `packages/agent/src/scout.ts` |
| `okx-dex-token` | Reads holder concentration through token holder data. | `packages/agent/src/okx-api.ts`, `packages/agent/src/guardian.ts` |
| `okx-dex-market` | Reads token prices, liquidity, volume, 24h change, and token metadata. | `packages/agent/src/okx-api.ts`, `packages/agent/src/sentinel.ts` |
| `okx-wallet-portfolio` | Reconciles wallet USDT balance and open token positions. | `packages/agent/src/okx-api.ts`, `packages/agent/src/index.ts` |
| `x402 payment rail` | Sells Guardian security checks to other agents via a paid HTTP endpoint. | `packages/agent/src/x402.ts` |
| `MCP tools` | Exposes Guardian and Scout tools for agent-to-agent use. | `packages/agent/src/mcp.ts` |

Uniswap skills are not used because RUGNOT is submitted as an OKX/X Layer-native defense agent. The project satisfies the mandatory skill requirement through multiple OKX Onchain OS modules.


## X Layer Mainnet Proof

The agent wallet has executed real X Layer transactions through the same runtime path used by the dashboard and API.

| Action | Token | OKLink proof |
|---|---:|---|
| Buy | FDOG | [0x7cb9dcb91cd33bf60eb65ebe96e72806a8f63c8dfa1a7a8363249a837c8cd843](https://www.oklink.com/x-layer/tx/0x7cb9dcb91cd33bf60eb65ebe96e72806a8f63c8dfa1a7a8363249a837c8cd843) |
| Buy | XDOG | [0x6b198d6718c305099d9838fab5b5d0c10689c7527910935326f1fde67e37e0f5](https://www.oklink.com/x-layer/tx/0x6b198d6718c305099d9838fab5b5d0c10689c7527910935326f1fde67e37e0f5) |
| Buy | SEED | [0x01f32bb67990d639304bdd42d295121a24da43e07c587654059536faaf8c7710](https://www.oklink.com/x-layer/tx/0x01f32bb67990d639304bdd42d295121a24da43e07c587654059536faaf8c7710) |
| Sentinel Exit | FDOG | [0x973a257ab1c583e444cb970ad91914a61be5bed009e821ebfa4e7e313f06fe02](https://www.oklink.com/x-layer/tx/0x973a257ab1c583e444cb970ad91914a61be5bed009e821ebfa4e7e313f06fe02) |
| Manual Exit | XDOG | [0xc6e11139d3ec8ba3e49f50d7675508e11e355328f85f40e0f4cfacf01015983a](https://www.oklink.com/x-layer/tx/0xc6e11139d3ec8ba3e49f50d7675508e11e355328f85f40e0f4cfacf01015983a) |

Agentic Wallet:

```text
0x4aa3af8c732a19ec9534fb56316497215e52fc3c
```

Explorer:

[OKLink X Layer wallet view](https://www.oklink.com/x-layer/address/0x4aa3af8c732a19ec9534fb56316497215e52fc3c)


## AI Interactive Experience

RUGNOT's chat is not a static FAQ. It is a Gemini tool-use interface connected to the live agent state.

Gemini tools:

| Tool | User-facing value |
|---|---|
| `check_token_safety` | Ask "is this token safe?" and receive a Guardian verdict with checks. |
| `get_portfolio_risks` | Ask "what is risky in my wallet?" and re-check current positions. |
| `find_safe_opportunities` | Ask "what can the agent buy?" and pull vetted OKX signal opportunities. |

If `GOOGLE_GENERATIVE_AI_API_KEY` is not configured, RUGNOT falls back to local state summaries. That keeps the app usable without pretending the fallback is an LLM.


## x402: Paid Security Checks

RUGNOT exposes Guardian as a paid API:

```text
POST /api/v1/security/check
```

The security check targets X Layer tokens. Payment settlement uses x402-supported USDC rails, with Base USDC as the default facilitator network.

```env
X402_ENABLED=true
X402_NETWORK=base
X402_PRICE_PER_CHECK=0.005
X402_PAY_TO=0xYourReceivingWallet
X402_FACILITATOR_URL=https://x402.org/facilitator
```

Why this matters for agentic payments:

```text
Another trading agent wants to buy a token
        |
        v
Pays RUGNOT over x402
        |
        v
Receives Guardian verdict
        |
        v
Avoids unsafe entries or proceeds with a safer trade
```

This is the earn-pay-earn loop:

```text
RUGNOT earns for security checks -> other agents pay before trading -> safer trades preserve capital -> more agents can keep using paid risk checks
```


## MCP Integration

RUGNOT exposes the same security tools through MCP so other agents and desktop clients can call the risk engine directly.

| MCP tool | What it returns |
|---|---|
| `check_token_safety` | Guardian verdict for a token address. |
| `get_portfolio_risks` | Risk report for all positions in a wallet. |
| `find_safe_opportunities` | OKX signal opportunities that pass Guardian. |

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


## Prize Category Fit

### Main Prize: X Layer Arena

| Scoring criterion | Why RUGNOT is strong |
|---|---|
| Onchain OS / Uniswap integration and innovation, 25% | Uses multiple OKX Onchain OS modules together, not as isolated API calls: signals feed Scout, security feeds Guardian, aggregator feeds Executor, portfolio feeds Sentinel. |
| X Layer ecosystem integration, 25% | The core wallet, gas, balances, approvals, swaps, portfolio, and proof transactions all happen on X Layer mainnet. The product addresses a real X Layer need: safer autonomous trading. |
| AI interactive experience, 25% | Gemini chat can call live tools for token safety, portfolio risk, and safe opportunity discovery. The dashboard streams agent reasoning in real time. |
| Product completeness, 25% | Includes dashboard, API, WebSocket stream, MCP, x402, persistence, admin controls, manual sell, sell-all, rate limiting, nonce handling, and confirmed OKLink transactions. |

### Special Prizes

| Prize | RUGNOT angle |
|---|---|
| Best x402 application | Paid agent-to-agent token safety checks. x402 is not a tip jar; it gates access to a useful Guardian verdict. |
| Most active agent | Real X Layer txs are linked above. The runtime can continue producing legitimate OKX-routed transactions under tiny caps. |
| Best MCP integration | RUGNOT exposes its security engine as MCP tools: check token, audit portfolio, discover safe opportunities. |
| Best economy loop | Security checks create revenue, revenue supports the defense agent, other agents pay before trading, and safer trading preserves future demand. |


## Dashboard Pages

| Page | Purpose |
|---|---|
| Scan | Public token security check. |
| Portfolio | Wallet exposure, PnL, trade ledger, manual sell, sell-all. |
| Security | Guardian Pipeline and verdict history. |
| Economics | x402 revenue and spend activity. |
| System | Scout, Guardian, Executor, Sentinel, Profile, and x402 operational panels. |
| Chat | Gemini analyst connected to live tools. |

The dashboard is intentionally an operations console: it shows what the agent is doing, why it is doing it, and where the transaction landed on OKLink.


## Safety Controls

RUGNOT is designed for small-wallet, high-risk environments where mistakes are expensive.

| Control | Status |
|---|---|
| `MAX_POSITION_SIZE_USDT` | Caps each entry. |
| `MAX_PORTFOLIO_SIZE_USDT` | Caps total exposure. |
| `RISK_TOLERANCE` | Conservative, moderate, or aggressive thresholds. |
| `POST /api/pause` | Stops automation. |
| `POST /api/resume` | Resumes automation. |
| `POST /api/settings` | Updates risk settings. |
| `POST /api/positions/:token/sell` | Manually exits one position. |
| `POST /api/positions/sell-all` | Manually exits all positions. |
| `ADMIN_TOKEN` | Protects admin routes in production. |
| State persistence | Persists wallet state, verdicts, threats, trades, and x402 economics. |


## Live Proof Mode

For a 1 to 3 minute video, the dashboard includes a bounded mainnet proof cycle:

```text
scan curated OKX X Layer tokens
-> run Guardian checks
-> buy safe routable candidates with a 1 USDT cap
-> monitor for under 2 minutes
-> selectively exit one risk-triggered position
-> leave the rest visible in Portfolio
```

Enable only during review:

```env
MAINNET_DEMO_ENABLED=true
MAINNET_DEMO_PUBLIC=true
MAINNET_DEMO_CANDIDATES=XDOG:0x0cc24c51bf89c00c5affbfcf5e856c25ecbdb48e,OEOE:0x4c225fb675c0c475b53381463782a7f741d59763,FDOG:0x5839244eab49314bccc0fa76e3a081cb1a461111,DOGSHIT:0x70bf3e2b75d8832d7f790a87fffc1fa9d63dc5bb,SEED:0x375da15dacce7a2a4f8075b5e39b8c2018057777,AI:0x256a55efa042a5e230078df730ffba53f5a77777
MAINNET_DEMO_AMOUNT_USDT=1
MAINNET_DEMO_BUY_COUNT=3
MAINNET_DEMO_MONITOR_MS=55000
MAINNET_DEMO_COOLDOWN_MS=300000
```

Public mode ignores arbitrary token overrides and uses only the configured curated basket.


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


## Mainnet Configuration

Minimum live variables:

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

The wallet needs:

```text
OKB on X Layer for gas
USDT on X Layer for trades
```

If OKX credentials are invalid, RUGNOT starts in demo-safe mode. If the wallet lacks OKB or USDT, live swaps stay disabled while dashboard/API features can still run.


## Local Mock Demo

Mock demo mode does not touch funds:

```env
ENABLE_DEMO=true
```

```bash
npm run dev
npx tsx scripts/demo-loop.ts
```


## Project Structure

```text
rugnot/
├── packages/
│   ├── agent/          Express API, OKX integrations, Guardian, Executor,
│   │                   Sentinel, MCP, x402, Gemini tools
│   └── dashboard/      React/Vite operations console
├── scripts/            Local demo and proof helpers
├── Dockerfile          Single-service production build
├── .env.example        X Layer, OKX, x402, MCP, and AI configuration
└── README.md
```


## Team

| Member | Role |
|---|---|
| Madhav Gupta | Full-stack engineer, agent runtime, dashboard, OKX/X Layer integration. |


## X Layer Ecosystem Positioning

RUGNOT is not just a trading bot. It is a defense layer for agentic finance on X Layer.

Today, every trading agent needs to solve the same safety problem alone: check token risk, confirm liquidity, simulate exits, watch positions, and react quickly when the route breaks.

RUGNOT packages that workflow into:

```text
1. an autonomous X Layer wallet,
2. a live dashboard for humans,
3. MCP tools for other agents,
4. x402-paid security checks,
5. OKLink-verifiable execution proof.
```

That makes it useful even beyond this repo. Any X Layer agent can ask RUGNOT for a verdict before it touches a token.


## Built For

OKX X Layer Arena.

RUGNOT is designed to score where the rubric matters: deep OKX Onchain OS usage, real X Layer execution, interactive AI tooling, and a complete product loop that turns token safety into shared infrastructure.
