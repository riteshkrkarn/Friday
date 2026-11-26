---
name: OpenJarvis
description: A transit-network interface for a local-first AI assistant. Every reply rides a drawn route from device to engine to model.
colors:
  signage-black: "#111111"
  signage-black-deep: "#000000"
  ground-light: "#fafaf7"
  ground-light-secondary: "#f2f2ee"
  ground-light-tertiary: "#e9e9e4"
  surface-light: "#ffffff"
  rule-light: "#ddddd8"
  ink-light: "#111111"
  ink-light-secondary: "#4d4d49"
  ink-light-tertiary: "#66665f"
  ground-dark: "#141414"
  ground-dark-secondary: "#1c1c1c"
  ground-dark-tertiary: "#242424"
  rule-dark: "#2e2e2e"
  ink-dark: "#f2f2ee"
  ink-dark-secondary: "#b5b5b0"
  ink-dark-tertiary: "#8f8f8a"
  action-light: "#0039a6"
  action-light-hover: "#002d85"
  action-dark: "#4f8cff"
  action-dark-hover: "#72a3ff"
  fail-light: "#da1912"
  fail-dark: "#f1554f"
  line-local: "#00933c"
  line-cloud-light: "#f95000"
  line-cloud-dark: "#ff6319"
  line-tools-light: "#a88702"
  line-tools-dark: "#fccc0a"
  line-data: "#996633"
  line-none-light: "#8a8a85"
  line-none-dark: "#777777"
typography:
  page-title:
    fontFamily: "Archivo Variable, Archivo, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: "30px"
    letterSpacing: "0"
  top-bar-title:
    fontFamily: "Archivo Variable, Archivo, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "28px"
    letterSpacing: "0"
  body:
    fontFamily: "Archivo Variable, Archivo, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "0"
  control:
    fontFamily: "Archivo Variable, Archivo, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  section-heading:
    fontFamily: "Archivo Variable, Archivo, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: "18px"
    letterSpacing: "0.06em"
  label:
    fontFamily: "Archivo Variable, Archivo, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: "16px"
    letterSpacing: "0.06em"
  figure:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
    fontFeature: "tnum"
  code:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
    fontFeature: "tnum"
rounded:
  none: "0px"
  base: "2px"
  full: "9999px"
spacing:
  rule-bar: "4px"
  line: "5px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  strip-width: "232px"
  system-panel-width: "320px"
  top-bar-height: "64px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-light}"
    typography: "{typography.control}"
    rounded: "{rounded.base}"
    padding: "0 14px"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.base}"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.action-light-hover}"
  button-small:
    typography: "{typography.control}"
    padding: "0 10px"
    height: "28px"
  input:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.ink-light}"
    typography: "{typography.control}"
    rounded: "{rounded.base}"
    padding: "6px 10px"
    height: "36px"
  strip-row:
    backgroundColor: "{colors.signage-black}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    padding: "0 20px"
    height: "36px"
  strip-row-active:
    backgroundColor: "#ffffff"
    textColor: "{colors.signage-black}"
  chip:
    textColor: "{colors.ink-light-secondary}"
    rounded: "{rounded.base}"
    padding: "0 8px"
    height: "22px"
  panel:
    backgroundColor: "{colors.surface-light}"
    rounded: "{rounded.base}"
  model-pill:
    textColor: "{colors.ink-light}"
    rounded: "{rounded.base}"
    padding: "0 12px"
    height: "36px"
---

# Design System: OpenJarvis

## Overview

**Creative North Star: "The Route Diagram"**

The assistant is a network, and the interface draws it. A request leaves this device, passes an engine, optionally calls tools, and ends at a model. The design borrows the visual language of the 1972 New York subway diagram and Unimark wayfinding: a black signage strip, white grotesk type, circular letter bullets, 5px colored lines on straight and 45/90-degree angles, and open-circle stations. Nothing in the interface is decorative. A colored line always means a real engine family, and a station always stands for a real step the app recorded.

The app is an operating tool used all day, so density and legibility lead. Surfaces are flat, bordered and square-cornered (2px). Depth comes from 4px rule bars, never shadow. Dark is the default theme; light is a separate, fully tuned theme, not an inversion. Both are chosen by the `.dark` class, and the toggle cycles Light, Dark, System.

Confirmed rejections: no gradients, no emoji, no glass or blur, no glow, no shadows, no pill-shaped status badges, no rounded cards.

**Key Characteristics:**
- Black signage strip sidebar in both themes, 232px, with a white 4px rule under the wordmark.
- Colour is reserved: line colours for engine families, one blue for action and selection, red for failure only. Everything else is neutral.
- Stations are open circles. A filled station means "current" (live or in progress).
- Figures (ids, latencies, token counts, costs) are set in JetBrains Mono with tabular numerals.
- Motion is single-axis, 120 to 200ms, ease-out. No bounce, no scale on hover.

## Colors

A signage palette: near-black and off-white grounds, four engine-family line colours, one action blue, one failure red.

### Primary
- **Route Blue** (light `#0039a6`, hover `#002d85`; dark `#4f8cff`, hover `#72a3ff`): the only action colour. Primary buttons, selected tabs (4px bottom bar), focus outlines (2px, 2px offset), links, text selection, the caret, input focus borders, active toggle borders. Dark text on it in dark theme (`#0a0a0a`), white in light.

### Secondary: engine-family lines
These four colours identify where a thing runs. They appear on stations, route segments, line-map rails and letter bullets, and nowhere else.
- **Local Green** (`#00933c`, both themes): local engines (ollama, llama.cpp, vLLM and any engine not named as cloud). Also the "This device" station.
- **Cloud Orange** (light `#f95000`, dark `#ff6319`): cloud engines and providers (cloud, litellm, nim, openai, anthropic, gemini, google, groq, openrouter, atlascloud) and models matched by cloud id or prefix.
- **Tools Yellow** (light `#a88702`, dark `#fccc0a`): tool-call stations. The light value is darkened to hold 3:1 on the light ground.
- **Data Brown** (`#996633`, both themes): memory, connectors, data sources, Deep Research searches.
- **Unassigned Grey** (light `#8a8a85`, dark `#777777`): no engine known, and the dashed "unavailable" station.

### Tertiary
- **Failure Red** (light `#da1912`, dark `#f1554f`): errors, failed stations, the 4px fail rule bar on the offline banner, danger buttons, error toasts. Never used for emphasis.

### Neutral
- **Signage Black** (`#111111` light, `#000000` dark): the sidebar strip; also the user message block in light theme. Strip text is `#ffffff`, muted `#a3a3a3`, hover `#222222` (light) or `#1f1f1f` (dark), inner rule `#4a4a4a` or `#3a3a3a`.
- **Ground** (light `#fafaf7`, dark `#141414`): page background. Secondary `#f2f2ee` / `#1c1c1c`, tertiary `#e9e9e4` / `#242424` for hover fills, code blocks and skeletons.
- **Surface** (light `#ffffff`, dark `#1c1c1c`): panels, dialogs, popovers, the composer.
- **Rule** (light `#ddddd8`, dark `#2e2e2e`): 1px borders. Subtle rule `#e9e9e4` / `#242424`. Input border is stronger (`#77776f` light, `#6e6e69` dark) so fields hold 3:1.
- **Ink** (light `#111111`, dark `#f2f2ee`): body text. Secondary `#4d4d49` / `#b5b5b0`, tertiary `#66665f` / `#8f8f8a`.
- **User block** (light `#111111`, dark `#2e2e2e`): solid block behind user messages, white text.

### Named Rules
**The Family Rule.** A line colour names an engine family. Navigation, headings, buttons and decoration never take one, and a screen shows only the families present in its data.

**The One Blue Rule.** Action and selection share a single blue per theme. Success is not green; "ok" is a word in mono type.

**The Words Not Pills Rule.** Status is plain text (`StatusText`: default, muted, fail), never a coloured badge.

**The Two Themes Rule.** Each theme is checked on its own: text 4.5:1 or better, lines, stations and focus marks 3:1 or better. `prefers-contrast: more` darkens rules and secondary text further. `prefers-color-scheme: dark` applies the dark values unless `.light` is set.

## Typography

**Display and body font:** Archivo (variable, self-hosted through `@fontsource-variable/archivo`, so it works offline in Tauri), fallbacks Segoe UI, system sans, Helvetica Neue, Arial.
**Figure and code font:** JetBrains Mono (variable, `@fontsource-variable/jetbrains-mono`), fallbacks ui-monospace, Cascadia Mono, Consolas. Always with tabular numerals.

**Character:** One neo-grotesk does all the speaking, in two weights that matter (400 and 700, with 500/600 for controls). Mono marks data: if a value could be copied, compared or timed, it is mono.

### Hierarchy
- **Page title** (700, 24px, 30px line): `PageHeader` title. One per page.
- **Top-bar title** (700, 20px, 28px line): conversation or page name in the 64px top bar.
- **Body** (400, 15px, 22px line): default text and chat messages. Prose in replies uses 24px line height; replies cap at 720px.
- **Control** (500, 14px, 20px line): buttons, inputs, tabs (tabs use 600).
- **Section heading** (700, 13px, 18px line, 0.06em, uppercase): `SectionHeading`, under a 4px rule bar.
- **Label** (700, 12px, 16px line, 0.06em, uppercase): table headers, strip group labels.
- **Figure** (mono 400, 12px, 18px line): route popover figures, line-map status, `StatusText`, page meta lines (13px).
- **Code** (mono, 13px, 20px line): code blocks and inline code (0.85em).

### Named Rules
**The Mono Means Data Rule.** Ids, model names, latencies, token counts and costs are mono with tabular numerals. Labels and sentences are never mono.

**The Uppercase Is For Rules Rule.** Uppercase with tracking appears only on section headings, labels and table headers, each sitting under or over a rule.

## Layout

A three-column shell inside a full-height, non-scrolling root: strip, centre column, optional System panel.

- **Strip:** 232px, collapsible to 0 (a small black toggle remains), fixed overlay with a scrim below `md`. Sections: wordmark row (60px) over a 4px white rule; two nav groups of four 36px rows; a 1px inner rule; the conversation list with search and "New chat".
- **Top bar:** 64px, 1px bottom rule, `pl-5 md:pl-8`. Title, model pill, "Thinking" station while streaming; at right the agent name (mono), Quick Capture, approval bell and the System panel toggle (Chat only).
- **Offline banner:** a full-width row under a 4px fail rule bar with a failed station, shown when the health check fails.
- **System panel:** 320px, right of Chat only. Sections Network, Device, This session, Leaderboard, each under a `SectionHeading`.
- **Chat column:** messages max 720px, composer at the bottom.
- **Page content widths:** Dashboard and Today 1120px; Settings and Data Sources 880px; Get Started 960px; prose lines cap near 65ch.
- **Rhythm:** 8px base. 16px between a heading and its content, 24px between sections, 20px strip padding.

Responsive: the strip becomes an overlay drawer below `md`; the Quick Capture button, agent label and engine label in the pill hide at narrower widths; the model id truncates (120px, 240px from `sm`).

## Elevation & Depth

There are no shadows. Every shadow token resolves to `0 0 #0000`. Depth is expressed three ways: a 4px rule bar on top of a raised object (dialogs, popovers, route figures, toasts, headings, the offline banner), a 1px border, and a tonal step between ground, secondary and surface. Hover raises a border from rule to input-border or fills with the tertiary ground. Overlays use a flat `rgb(0 0 0 / 0.6)` scrim with no blur.

### Named Rules
**The Rule Bar Rule.** "Raised" means a 4px bar on the top edge, in ink colour, or fail red for errors. It never means a shadow, glow or blur.

## Shapes

Rectangles with 2px corners (0 where a block meets an edge, such as code blocks inside a wrapper). Circles exist only as stations (open circle, 3px stroke from 12px up, 2px below) and letter bullets (20px filled circle with a 0.55em bold letter). Lines are 5px strokes (`--line` rail, `.tn-seg` segment). A route segment takes the colour of the station it leads into. A line-map rail is split into top and bottom halves, each taking its own station's colour.

Station states: **open** (stroked, ground-filled), **current** (filled), **unavailable** (dashed grey stroke), **failed** (red stroke).

## Components

### Buttons (`tn-btn`)
- **Shape:** 2px corners, 2px border, 36px high (28px small), 14px type, 14px side padding.
- **Default:** transparent with an input-border stroke. Hover moves the stroke to full ink.
- **Primary:** action blue fill and border, on-action text. Hover darkens (light) or lightens (dark).
- **Ghost:** no border, hover fills tertiary ground. **Danger:** fail-red stroke and text, 12% red fill on hover. **Invert:** ink fill, ground text.
- **Icon button** (`tn-icon-btn`): 32px, secondary ink, tertiary-ground fill on hover, expanded or pressed.
- **Disabled:** 45% opacity (35% for icon buttons), `not-allowed`.

### Inputs (`tn-input`, `tn-textarea`, `tn-select`)
2px input-border stroke, input-bg fill, 36px high, 14px type. Focus turns the border action blue (the global 2px outline is suppressed on these fields because the border carries focus). Disabled uses disabled-bg and tertiary ink. The composer (`tn-composer`) is a 2px bordered surface that turns blue on `:focus-within`; toggles such as Deep Research take a blue border and 10-12% blue fill when pressed.

### Tabs (`tn-tabs`)
Row with a 1px bottom rule and 24px gaps. Tabs are 14px/600 secondary ink; selected is full ink with a 4px action-blue bottom bar.

### Navigation (signage strip)
Rows are 36px, white 15px text on black, with a `LineBullet` letter (C, T, A, D, O, L, S, W). Hover fills strip-hover. The current page inverts: white row, black text, 700 weight, bullet swaps to black fill with white letter (`aria-current="page"`). Focus outline is white and inset. Conversations are rows with a transparent 4px top border that turns white when active; row actions use `tn-reveal` (hidden until hover or focus, always shown on touch).

### Model pill
36px, 2px ink border, 2px corners: a 12px `Station` in the model's line colour, the model id in mono, the engine name in secondary ink, and a `Kbd` hint for Command-K. Station state reflects the app: failed (backend offline), unavailable (no model or loading), current (streaming), open otherwise. It opens the model picker.

### Route strip (signature component)
`RouteStrip` renders an ordered list of stations joined by 5px segments. Stations come only from recorded data: This device, engine, each tool call, search traces for Deep Research, and the model with its latency. Each station is a focusable button with a full spoken summary as its `aria-label`; hovering or focusing it reveals a figures popover (`tn-route-pop`: 4px ink rule bar, 1px border, mono definition list). The last station of a streaming reply is filled and the list is `aria-busy`. Segments draw left to right in 160ms with a 60ms stagger; with reduced motion they appear complete. Labels are 12px, truncated at 200px; tool and model labels are mono.

### Line map
`LineMap` is the vertical form: stations on a 5px rail with a label at the left and a mono right-aligned status (for example `running`, `ok · 0.6s`, an error code in red). Used for engines in the System panel and for providers and engines in Settings.

### Page chrome
- **PageHeader:** title (24px/700), optional mono meta line (13px, secondary ink), actions at the right, 1px bottom rule.
- **SectionHeading:** a 4px ink rule bar over a 13px uppercase label, with optional actions right-aligned in normal case.
- **Tables** (`tn-table`): 14px, 2px ink rule under uppercase 12px headers, 1px rules between rows, no zebra, no side padding on the first column.
- **Chips** (`tn-chip`): 22px high, 1px border, 12px secondary text. **Kbd:** 18px, 1px border, mono 11px.
- **Panels** (`tn-panel`): surface fill, 1px border, 2px corners. The legacy `studio-card`, `hw-panel` and `hud-panel` aliases render the same flat panel.
- **Dialogs** (`tn-dialog`): surface, 1px border, 4px ink top bar. **Toasts:** same 4px top bar; red for errors; no shadow.

### Messages
User turns are solid blocks (`--user-block-bg`, white text, max 560px or 90%). Assistant replies open with their route strip, then prose, with code in a hairline-bordered mono block. Citations from Deep Research are small mono blue chips that fill blue on hover.

### Motion
- **Duration and easing:** 120ms ease-out for colour, border and background changes; 160ms for the station fill and the destination arrow (a 3px translate on x); 200ms for strip width; 400ms opacity bump for synced data. No bounce, no scale on hover, no layout shift on state change.
- **Reduced motion:** all animation and transition durations collapse to 0.01ms and route segments render complete.

## Page Patterns

All eight pages sit in the same shell and reuse the same primitives.

- **Chat:** messages, route strip per reply, composer with Deep Research, Mic and Send (primary blue, bottom right). System panel at the right.
- **Today & Brief:** 1120px column of `SectionHeading` blocks, tabs, the same strip and rules.
- **Agents:** each agent is a line; scheduled and past runs are stations (`Station` and `RouteStrip`); `PageHeader`, section headings and a tabbed detail view.
- **Data Sources:** connectors as stations on the data line with sync status text, in tabs, 880px column.
- **Overview (Dashboard):** `PageHeader`, 1120px grid of cost and energy against the all-cloud comparison.
- **Logs:** `PageHeader` and a table of traces rendered as routes.
- **Settings:** `PageHeader`, `LineMap` lists for engines and providers, section headings for each group, 880px column.
- **Walkthrough (Get Started):** 960px column of numbered section headings and tables, using the same rules and bullets.
- **Setup flows, model picker, command palette:** dialogs with a 4px top bar; the model picker groups models by line (Installed on green, Cloud on orange), each model a station with service state; the keyboard-selected row gets a 2px blue inset outline.

## Do's and Don'ts

### Do:
- **Do** colour only by engine family: local `#00933c`, cloud orange, tools yellow, data `#996633`; read colours through `var(--line-*)`, not literals.
- **Do** build route strips from real telemetry and tool-call data only. No invented stations.
- **Do** show status as mono words: `running`, `ok · 0.6s`, an error code in `var(--fail)`.
- **Do** raise objects with a 4px rule bar on top and a 1px border.
- **Do** keep corners at 2px, and use circles only for stations and bullets.
- **Do** use `PageHeader`, `SectionHeading`, `LineMap`, `RouteStrip`, `Station`, `LineBullet`, `StatusText` and `Kbd` from `components/transit` before writing new markup.
- **Do** give every focusable thing the 2px action-blue outline with 2px offset (white and inset inside the strip).
- **Do** set ids, model names and numbers in mono with tabular numerals.
- **Do** verify both themes separately for contrast.

### Don't:
- **Don't** use gradients, emoji, glass, blur, glow or box shadows.
- **Don't** put a line colour on navigation, headings or decoration, or show a family the data does not contain.
- **Don't** make coloured status pills or badges. Use `StatusText`.
- **Don't** round cards, buttons or inputs beyond 2px.
- **Don't** use red for anything but failure.
- **Don't** scale on hover, bounce, or animate layout. Restyle in place.
- **Don't** invert the light theme to make the dark one, or the reverse.
- **Don't** add a second blue or a green "success" colour.
