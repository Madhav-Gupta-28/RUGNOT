# Stitch Prompt: RUGNOT DashboardPage

Design a production-ready **DashboardPage** for RUGNOT, an autonomous DeFi defense agent on OKX X Layer. The page should feel alive even with mock or demo data. It must look like a premium black security terminal, inspired by the provided Ascend reference: almost-black canvas, thin terminal rails, huge confident white typography, compact mono counters, sparse green signal accents, and ledger-like live activity rows.

This is not a marketing page. It is the operator’s first command view: Scout signals, Guardian verdicts, trades, threats, auto-exits, and x402 revenue all visible as one living system.

**DESIGN SYSTEM (REQUIRED):**
- Platform: Web, desktop-first but responsive
- Palette: Void Black `#080a0b`, Carbon Surface `#0f1214`, Raised Steel `#15191d`, Graphite Line `#20262b`, Cold White `#eef2f5`, Smoke Gray `#8d96a0`, Signal Green `#39e58c`, Data Blue `#4b8dff`, Alert Amber `#ffb84d`, Threat Red `#ff5f5f`
- Typography: DM Sans for headings and prose, JetBrains Mono for labels, scores, addresses, timestamps, telemetry
- Shape language: restrained rounded corners, thin crisp borders, broad flat panels, almost no shadow
- Mood: black terminal, sparse signal color, audit-friendly, serious, alive, no generic AI gradients

**STYLE RULES:**
- Keep most surfaces black or charcoal
- Use accent colors as precise highlights, not large fills
- Favor terminal strips, data rails, and structured ledger layouts
- The interface should feel expensive, technical, and calm under pressure
- No purple gradients, no glowing blobs, no generic AI SaaS cards
- Green is the lead accent, blue is neutral technical information, amber is economic/caution, red is danger/threat

## Page Structure

### 1. Top Command Rail
A thin full-width terminal strip at the top of the dashboard content, similar to the reference’s `RESOLVED / Round #11` rail.

Content:
- Left chip: `LIVE`
- Main label: `RUGNOT COMMAND`
- Metadata: `X Layer / chain 196`
- Right side: wallet short address, running/paused/stopped state, USDT balance

Visual:
- Dark shell, thin graphite border
- Mono text
- Tiny green status dot
- Low height and restrained padding

### 2. Main Hero Command Bay
Create a large austere command bay that dominates the top half of the page.

Content:
- Small mono eyebrow: `AUTONOMOUS DEFENSE ONLINE`
- Huge headline: `RUGNOT`
- Subheadline: `Scout finds signals. Guardian blocks rugs. Sentinel exits threats.`
- Two compact CTA/status buttons:
  - `WATCH LIVE FEED`
  - `OPEN SECURITY`
- Right side can contain a compact “system matrix” or current mode panel:
  - `SCOUT`
  - `GUARDIAN`
  - `EXECUTOR`
  - `SENTINEL`
  Each with status values such as `WATCHING`, `VETTING`, `ARMED`, `DEFENDING`

Visual:
- Huge white headline like the reference
- Lots of black negative space
- Use green only for live status and primary CTA outline
- Thin terminal panel border
- No image hero, no marketing illustration

### 3. Metric Counter Row
Below the hero, create a four-column row of terminal counters.

Metrics:
- `TOTAL SCANS`
- `THREATS BLOCKED`
- `PORTFOLIO VALUE`
- `X402 REVENUE`

Visual:
- These should not look like generic KPI cards
- Make them compact market modules with thin borders and mono labels
- Big mono number
- Small descriptor below
- Use:
  - Data Blue for scans
  - Threat Red for blocked threats
  - Signal Green for portfolio value
  - Alert Amber for x402 revenue

### 4. Live Activity Stream
This is the second most important area after the hero. Make it feel alive even with demo/mock events.

Content:
- Section label: `LIVE ACTIVITY STREAM`
- Sub-label: `Guardian verdicts, trades, exits, and paid security checks`
- Right side status: `AWAITING EVENTS` or `STREAMING`
- Event rows:
  - timestamp
  - event type chip: `VERDICT`, `TRADE`, `THREAT`, `EXIT`, `X402`
  - event description
  - small external/network marker like `X LAYER`

Example row copy:
- `[11:31:55] VERDICT Scanned XPUMP - GO (score: 82)`
- `[11:32:04] TRADE Bought 50 USDT of XPUMP`
- `[11:32:09] THREAT Whale dump detected on XPUMP`
- `[11:32:12] EXIT Auto-exited XPUMP - saved $38`
- `[11:32:20] X402 Earned $0.005 from security check`

Visual:
- Ledger/activity-stream style like the reference
- Dark rows with thin separators
- Alternating subtle row states, not heavy cards
- Use red text only for threats/exits
- Use green text for safe/trade success
- Use amber for x402/economics
- Animate new rows subtly with slide/fade

### 5. Defense Loop Cards
Below or beside the feed, include three process modules that make the product feel alive even when data is sparse.

Modules:
1. `01 SCOUT`
   - `Scanning OKX market signals`
   - mini status: `signal feed armed`
2. `02 GUARDIAN`
   - `Five checks before capital moves`
   - mini status: `pipeline active`
3. `03 SENTINEL`
   - `Monitoring positions for threats`
   - mini status: `auto-exit ready`

Visual:
- Similar to reference’s step cards
- Small green numbered chips
- Broad thin-bordered rows or cards
- Keep copy short and operational

### 6. Current Round / Demo Mode Strip
Include a horizontal strip that makes demo data feel intentional, not fake.

Content options:
- `DEMO CYCLE #11`
- `XPUMP / LAYERDOG / OKXAI`
- `3 candidates scanned`
- `1 trade executed`
- `1 auto-exit armed`

If real data is present, this becomes:
- `LIVE CYCLE`
- latest token symbol
- latest verdict level
- latest threat count

Visual:
- Thin horizontal terminal rail
- Mono text
- Small status chips

### 7. Empty State Behavior
The dashboard must look excellent even when the backend is offline or state is empty.

Empty state should not be a sad blank card. It should look like a dormant command center.

Content:
- Hero still says `RUGNOT`
- Counters show `0`, `$0.00`, or `--`
- Live feed shows faint placeholder rows:
  - `AWAITING SCOUT SIGNAL`
  - `AWAITING GUARDIAN VERDICT`
  - `AWAITING SENTINEL POSITION`
- A button or chip: `RUN DEMO LOOP`

Visual:
- Ghosted ledger rows
- Low-contrast terminal skeletons
- Still premium and alive

## Layout Requirements
- Desktop: top rail, large hero bay, metric counters, live stream, defense loop modules.
- The first screen should immediately feel like the app is running.
- Do not create a marketing landing hero. This is a working dashboard.
- Avoid nested floating cards. Use broad terminal bays and ledger rows.
- Text must fit on mobile and desktop.
- Use JetBrains Mono for all labels, numbers, scores, timestamps, token symbols, and addresses.
- Use DM Sans for short explanatory copy.

## Copy Tone
Use short operator-style copy:
- `AUTONOMOUS DEFENSE ONLINE`
- `SCOUT SIGNALS`
- `GUARDIAN VERDICTS`
- `SENTINEL EXITS`
- `LIVE ACTIVITY STREAM`
- `DEMO CYCLE`
- `CAPITAL PROTECTED`
- `RUG CHECKS ACTIVE`

Avoid marketing words:
- no “features”
- no “unlock”
- no “AI-powered platform”
- no “seamless”
- no “beautiful dashboard”

## Responsive Behavior
- Desktop: wide command bay and multi-column counters.
- Tablet: hero stacks but keeps the live feed prominent.
- Mobile: top rail compresses, metrics become two columns, live feed remains readable, defense loop cards stack.

## Reference Interpretation
From the provided reference images, preserve:
- almost-black background
- huge confident white typography
- thin bordered terminal panels
- sparse green state indicators
- mono activity stream mood
- ledger/table discipline
- calm premium density

Adapt it to RUGNOT:
- replace prediction-market language with DeFi defense language
- replace “agents prove intelligence” with “agent prevents rugs”
- replace round activity stream with real security/trade/x402 events
- make the page feel alive through live feed, loop status, and demo-cycle rails
