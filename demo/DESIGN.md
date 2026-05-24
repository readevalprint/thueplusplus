---
version: alpha
name: thuepp-browser-workbench
description: "Dark formal interpreter workbench for the thue++ browser demo: a near-black developer surface, one electric accent, code-first panels, and visible runtime/adapter boundaries."
colors:
  primary: "#00D992"
  primary-soft: "#7FFFD2"
  on-primary: "#06110D"
  canvas: "#0B0F0E"
  canvas-glow: "#10211B"
  panel: "#111715"
  panel-strong: "#161F1C"
  code: "#070A09"
  border: "#27352F"
  border-strong: "#3C5148"
  ink: "#F2F7F4"
  body: "#A9BAB2"
  mute: "#738078"
  danger: "#FF7A90"
  danger-panel: "#48242D"
typography:
  display-xl:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 5.8rem
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.075em"
  body-md:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Inter, ui-sans-serif, system-ui, sans-serif
    fontSize: 0.78rem
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.12em"
  code:
    fontFamily: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
    fontSize: 0.92rem
    fontWeight: 400
    lineHeight: 1.45
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
rounded:
  sm: 8px
  md: 12px
  lg: 18px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: 11px
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
  button-secondary:
    backgroundColor: "{colors.panel-strong}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 11px
  button-danger:
    backgroundColor: "{colors.danger-panel}"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: 11px
  example-card:
    backgroundColor: "{colors.code}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 12px
  example-card-active:
    backgroundColor: "{colors.code}"
    textColor: "{colors.primary-soft}"
    rounded: "{rounded.md}"
    padding: 12px
  status-chip:
    backgroundColor: "{colors.panel-strong}"
    textColor: "{colors.body}"
    rounded: "{rounded.md}"
    padding: 12px
  code-surface:
    backgroundColor: "{colors.code}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: 12px
  app-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 32px
  hero-glow:
    backgroundColor: "{colors.canvas-glow}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: 24px
---

## Overview

The browser demo should feel like a formal interpreter workbench, not a generic dark form. It presents a real thue++ runtime compiled to Go-WASM and isolates execution in a Web Worker. The design should constantly reinforce that boundary: Go owns semantics; JavaScript supplies browser resources and observability.

The visual language borrows broad patterns from developer-tool references such as VoltAgent, Linear, Warp, Cursor, and Vercel without copying their brands: near-black canvas, one disciplined accent, code/editor surfaces, compact status chips, and dense but readable panels.

## Colors

Use a single electric green accent for primary action, focus, active example cards, status highlights, and code-link emphasis. Do not introduce secondary accent rainbows. Danger/error states use the danger red only for failures and destructive remove buttons.

The canvas stays near-black. Panels are only slightly lifted from the canvas. Code and output surfaces are darker than panels so source/stdout/coverage read as terminal-like artifacts.

## Typography

Use Inter/system sans for UI and headings. Use the mono stack only for code, source, stdout/stderr, coverage, and callback logs. Eyebrows are uppercase with generous tracking to signal technical labels. Headlines may be large and tightly tracked; body copy must remain calm and readable.

## Layout

Desktop layout is a three-part workbench:

1. Example navigator rail.
2. Input/editor stack for source, stdin, named resources, and run controls.
3. Observability panel for status and output tabs.

The observability panel may be sticky on wide screens. At tablet/mobile widths the layout collapses to one column in this order: hero, status strip, examples, inputs, outputs.

## Elevation & Depth

Depth is subtle: one-pixel borders, inset highlights, and soft dark shadows. Avoid glassmorphism, heavy gradients, and decorative 3D effects. The only ambient glow should be a restrained dark green canvas bloom behind the hero.

## Shapes

Use 8px radius for inputs/buttons/code surfaces, 12px for cards, and 18px for major panels. Avoid full-pill controls except if a future command palette needs it.

## Components

- Primary button: electric green background, near-black text, heavy label.
- Secondary button: strong panel background, border, light text.
- Example card: code-surface background, active green border/ring, name + adapter feature + short description.
- Status chip: label/value pair with uppercase muted label and strong value.
- Output tabs: compact segmented buttons; active tab uses the primary accent.
- Code/output surfaces: mono font, darker than panels, preserve whitespace, scroll overflow.
- Copy notice: short inline status text, non-blocking, never a toast dependency.

## Do's and Don'ts

Do:

- Keep the runtime contract visible: real Go-WASM, Worker-backed, browser resources only.
- Keep raw stdout/stderr/errors/resources/coverage available.
- Make examples educational before the user runs them.
- Prefer tokenized CSS variables over one-off raw values.
- Preserve keyboard focus states and contrast.

Don't:

- Suggest JavaScript evaluates thue++ rules.
- Hide raw diagnostics behind decorative summaries.
- Copy a third-party brand identity or logo style.
- Add a component framework just for visual polish.
- Add more accent colors without a semantic reason.
