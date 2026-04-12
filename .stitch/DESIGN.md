# Design System: RUGNOT
**Project ID:** Local design system for `packages/dashboard`

## 1. Visual Theme & Atmosphere
RUGNOT should feel like a midnight command center for autonomous onchain defense: sharp, quiet, institutional, and dangerous in a controlled way. The mood is closer to a premium trading terminal or a security operations console than a startup dashboard. The canvas is almost black. Information sits on thin rails, shallow panels, and disciplined grids. Visual drama comes from typography, spacing, and signal color, not from heavy decoration.

The closest emotional references are:
- High-trust market infrastructure
- Threat-monitoring software with real capital at stake
- A black-site trading terminal with sparse illumination

The design should communicate three things instantly:
1. This agent is serious about security.
2. This system is alive and watching markets in real time.
3. Every action is measurable, explainable, and audit-friendly.

Keep the UI severe but expensive. Avoid playful crypto clutter. Avoid generic AI gradients. Avoid “futuristic” ornament that does not serve legibility.

## 2. Color Palette & Roles
Use green as the lead accent because it supports the safety/profit/security story and matches the reference direction well, but do not make the UI monochrome green. Green should be the hero accent, with blue, amber, and red used deliberately for system states.

- **Void Black** `#080a0b`
  Primary page canvas. Almost pure black, but not true black.

- **Carbon Surface** `#0f1214`
  Default panel background for cards, feeds, tables, and shells.

- **Raised Steel** `#15191d`
  Elevated surfaces, active nav states, expanded cards, focused modules.

- **Graphite Line** `#20262b`
  Hairline borders, dividers, chart axes, table separators.

- **Cold White** `#eef2f5`
  Primary headings, high-priority metrics, terminal-style hero text.

- **Smoke Gray** `#8d96a0`
  Secondary labels, long-form descriptions, timestamps, helper text.

- **Signal Green** `#39e58c`
  GO verdicts, active status, primary CTA states, resolved-safe highlights.

- **Data Blue** `#4b8dff`
  Informational metrics, network/system traces, neutral chart overlays, pipeline context.

- **Alert Amber** `#ffb84d`
  CAUTION states, pending reviews, paid-service economics, uncertain outcomes.

- **Threat Red** `#ff5f5f`
  DANGER verdicts, blocked trades, whale-dump warnings, exit events.

- **Terminal Cyan** `#59d7ff`
  Optional tertiary accent for small data traces or technical annotations. Use rarely.

### Color Behavior
- Most of the interface should remain black, gray, and white.
- Accent colors should appear as thin strokes, compact chips, micro-labels, chart lines, and key numbers.
- Green should never flood large surfaces. Use it like a laser, not a paint bucket.
- Blue supports technical trust. Red and amber must feel surgical, not theatrical.

## 3. Typography Rules
RUGNOT already uses **DM Sans** and **JetBrains Mono**, which are good fits. Keep them.

- **Display / Headlines:** DM Sans, bold, clean, oversized, high-contrast.
  Headlines should feel blunt and confident. Large hero text can go uppercase if it improves impact, but do not overuse all caps in body copy.

- **Labels / Telemetry / Timestamps / Scores / Addresses:** JetBrains Mono.
  This is the backbone of the terminal feel. Small uppercase mono labels with generous spacing should mark sections, status strips, and metadata.

- **Body Copy:** DM Sans, medium or regular weight.
  Keep prose short. Product copy should read like operator notes, not marketing.

### Typographic Character
- Headings: dense, crisp, high-contrast, left-aligned.
- Labels: mono, uppercase, airy spacing, understated.
- Numbers: mono, large, calm, trustworthy.
- Avoid decorative type treatments, gradients, outlines, and oversized shadows.

## 4. Component Stylings
### Buttons
- Primary buttons should be dark surfaces with a thin Signal Green outline or fill, depending on importance.
- Secondary buttons should be black-on-black with subtle graphite borders.
- Button shapes should feel precise, with restrained rounding and strong horizontal posture.
- Hover should brighten borders or text slightly rather than jumping position or scale.

### Cards / Containers
- Use broad low-contrast panels rather than floating cards.
- Corners should be restrained: subtly rounded, never bubbly.
- Borders should be thin and visible, with almost no drop shadow.
- Large modules should feel like terminal bays or control surfaces.
- Avoid card-inside-card nesting unless the inner element is clearly a row, modal, or functional subpanel.

### Inputs / Search / Chat
- Inputs should feel embedded into the surface, not like generic rounded app inputs.
- Use mono for technical inputs when relevant, sans for conversational input.
- Focus states should rely on a crisp accent ring or border shift, not glow soup.

### Tables / Feeds
- Rows should feel like ledger entries.
- Dividers matter more than background changes.
- Status chips should be compact and precise.
- Hover states should slightly brighten the row shell, not recolor the whole table.

### Charts
- Charts should be sparse and infrastructural.
- Grid lines should be faint graphite.
- Green and blue should do most of the chart work, with amber/red only for warning overlays.
- Tooltips should look like terminal tooltips: dark shell, thin border, mono numbers.

### Status Badges
- GO: dark chip with thin green line and subtle inner illumination.
- CAUTION: dark chip with amber border and restrained warmth.
- DANGER: dark chip with red stroke; urgency should come from contrast, not cartoon effects.

## 5. Layout Principles
RUGNOT should breathe like a premium control panel.

- Use generous horizontal padding and stable vertical rhythm.
- Favor full-width bands with constrained inner content.
- Lead with a strong top command area, then fall into information modules.
- Use thin divider lines to organize sections instead of stacking many decorative boxes.
- Maintain wide gutters and clean alignment lines.
- Dense information is welcome, but it must be structured into calm, readable groups.

### Spatial Character
- The page should feel quiet and expensive, not crowded.
- The user should always know where the “live” part of the screen is.
- Empty states should still feel intentional, like dormant terminals waiting for signals.

## 6. Signature Interaction Patterns
### VerdictPipeline
This is the hero artifact of the entire product.

- It should feel like a security checkpoint chain, not a playful progress stepper.
- Each step should read as a live inspection node.
- The connections between steps should feel like routed signal paths.
- Scores should feel technical and authoritative.
- Reasons should read like terse operator notes.

### Live Feed
- Should feel like an event tape or security stream.
- Entries slide in subtly, like fresh log events appearing on a terminal.
- Most entries remain dark; only the important metadata should carry color.

### Stat Blocks
- Make them feel like compact market modules, not KPI marketing cards.
- Emphasize the big number, then the small mono label.
- They should look stable enough for a trader to trust at a glance.

### Security Lists
- Expand/collapse should feel like opening a case file.
- Use the header row to front-load verdict, address, score, and time.
- Expanded detail should feel forensic.

## 7. Motion & Feedback
Motion should feel infrastructural, not playful.

- Use subtle fades and short vertical slide-ins for feed entries.
- Use a soft pulse only for active-safe or live-running states.
- Use a restrained shake only for danger chips or fresh blocked alerts.
- Avoid bounce, overshoot, parallax, floating orbs, or celebratory animation.

The ideal motion language is: “systems updating,” not “UI showing off.”

## 8. Page-by-Page Visual Intent
### Dashboard
The dashboard should open like an operator console. The first impression should be one strong command surface, then compact stat modules, then the live feed. The mood should be: “the machine is awake.”

### Security
This page should feel like a threat-analysis bay. VerdictPipeline must dominate the visual identity here. Think forensic, explainable, and high-confidence.

### Portfolio
This should feel like a monitored book, not a wallet app. PnL and security state must coexist without visual conflict.

### Economics
This page should feel like a service ledger. x402 revenue needs to read like infrastructure monetization, not side income.

### Chat
The chat should feel like an operator terminal with intelligence behind it. Keep it dark, disciplined, and text-first.

## 9. Do / Don’t Rules
### Do
- Use black as the dominant field.
- Let green lead, but support it with blue, amber, and red.
- Make borders, labels, and spacing carry sophistication.
- Keep typography strong and controlled.
- Make modules feel infrastructural and credible.

### Don’t
- Do not use purple gradients, neon fog, glassmorphism haze, or floating decorative blobs.
- Do not make the interface look like a generic AI copilot landing page.
- Do not overuse bright green fills.
- Do not rely on oversized shadows for depth.
- Do not make panels look soft, bubbly, or toy-like.

## 10. Stitch Prompt Block (Required)
Use this block in future Stitch prompts for RUGNOT screens:

```md
Dark, premium onchain security terminal for an autonomous DeFi defense agent. The mood is institutional, sharp, and high-trust, like a threat-monitoring console crossed with a market intelligence terminal.

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
```
