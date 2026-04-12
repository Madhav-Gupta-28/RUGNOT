# Stitch Prompt: RUGNOT SecurityPage

Design a production-ready **SecurityPage** for RUGNOT, an autonomous DeFi defense agent on OKX X Layer. The page must feel like a premium black security terminal, inspired by the provided Ascend reference: sparse black canvas, thin rails, huge confident typography, mono ledger rows, green signal accents, and restrained red/amber threat states.

The page is not a marketing landing page. It is the live Guardian console where an operator watches token scans and expands verdicts. Make **VerdictPipeline** the visual centerpiece of the entire screen.

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
- Green is the lead accent, but use blue for neutral technical data, amber for caution, and red for danger

## Page Structure

### 1. Top Status Rail
A thin horizontal terminal strip at the top of the content area, similar to the reference’s “Round #11” rail.

Content:
- Left chip: `GUARDIAN ONLINE`
- Main label: `Security Console`
- Metadata: `X Layer / chain 196`
- Right side: wallet short address, agent mode, last scan time

Visual:
- Very dark shell
- Thin graphite border
- Mono text
- Tiny green live dot
- No heavy height

### 2. Command Header
Below the rail, create a large austere command header.

Content:
- Small mono eyebrow: `FIVE-LAYER DEFENSE`
- Large headline: `GUARDIAN`
- Subheadline: `Every token passes contract, holder, smart-money, liquidity, and simulation checks before capital moves.`
- Compact metrics on the right:
  - `SCANS`
  - `GO`
  - `CAUTION`
  - `DANGER`

Visual:
- Huge white headline like the Ascend reference
- Left-aligned, lots of black negative space
- Metrics should look like terminal counters, not colorful KPI cards
- Thin dividers and mono labels

### 3. VerdictPipeline Hero Bay
This is the centerpiece. It should occupy a large full-width terminal bay.

Content:
- Header row:
  - `LIVE VERDICT PIPELINE`
  - Selected token address in mono, truncated
  - Verdict badge: `GO`, `CAUTION`, or `DANGER`
  - Score: large mono number, e.g. `82`
  - Timestamp
- Main artifact: horizontal 5-step pipeline:
  1. `Contract Safety`
  2. `Holder Analysis`
  3. `Smart Money`
  4. `Liquidity`
  5. `Tx Simulation`

Each pipeline node:
- Circular or squared-terminal node, not playful
- Score number in the center
- Small uppercase mono layer name
- One-line reason below
- Connection line between nodes should look like a routed signal path
- Green path for passing checks, amber for warning, red for failed checks

Visual:
- Larger and more dramatic than the current component
- Looks like a security checkpoint chain, not a stepper
- Use subtle inner illumination, thin lines, and strict alignment
- Add small labels like `LAYER 01`, `LAYER 02`, etc.
- On mobile, stack vertically as a forensic inspection chain

### 4. Filter Bar
Under the hero bay, include compact filter controls.

Filters:
- `ALL`
- `GO`
- `CAUTION`
- `DANGER`

Visual:
- Mono pill/rectangular chips
- Active state uses green outline or matching state color
- Keep controls low-profile

### 5. Verdict Dossier List
Below filters, show verdict cards as ledger-like case files. This is where recent verdicts live.

Each row/card:
- Left: verdict badge
- Token address in mono
- Score as large mono number
- Time ago
- Compact one-line summary: `5 checks complete / 1 warning / 0 blocked`
- Expand/collapse affordance

Expanded state:
- Shows the same VerdictPipeline in a smaller forensic version
- Shows raw check rows beneath:
  - check name
  - score
  - pass/fail
  - reason

Visual:
- Rows should feel like ledger entries, not rounded app cards
- Use thin separators
- Hover should gently brighten border or row background
- Expanded row should feel like opening a case file

### 6. Empty State
If there are no verdicts, show a beautiful dormant terminal.

Content:
- `NO VERDICTS RECORDED`
- `Guardian output will appear here as Scout cycles and security checks complete.`
- A ghosted 5-step pipeline with `--` scores

Visual:
- Dark shell
- Dashed or faint graphite border
- Low-contrast pipeline skeleton
- Still premium and demo-ready

## Layout Requirements
- Desktop content should be wide and centered with strong margins.
- The VerdictPipeline hero bay should be the largest element on the page.
- Avoid nested floating cards. Use broad terminal bays and ledger rows.
- Text must not overflow on mobile.
- Keep all numbers, addresses, labels, scores, and timestamps in JetBrains Mono.
- Keep descriptive copy in DM Sans.

## Copy Tone
Use short operator-style copy only:
- `GUARDIAN ONLINE`
- `FIVE-LAYER DEFENSE`
- `LIVE VERDICT PIPELINE`
- `RECENT VERDICTS`
- `TOKEN CLEARED`
- `MANUAL REVIEW`
- `AUTO-BLOCKED`

Do not use marketing copy like “features”, “powerful”, “unlock”, or “AI-powered platform.”

## Responsive Behavior
- Desktop: top rail, big command header, full-width horizontal VerdictPipeline, then filters and verdict dossiers.
- Tablet: keep the pipeline horizontal if possible, compress labels.
- Mobile: stack the pipeline vertically and keep the selected verdict summary at the top.

## Reference Interpretation
From the provided reference images, preserve:
- almost-black background
- huge confident white typography
- thin bordered terminal panels
- sparse green state indicators
- mono activity stream mood
- ledger/table discipline

Adapt it to RUGNOT:
- replace prediction-market language with token security language
- replace agent leaderboard with verdict dossiers
- replace round resolution with Guardian scan results
- make the 5-layer pipeline the hero artifact
