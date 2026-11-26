---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: ["frontend/src/pages","frontend/src/components","desktop/src-tauri/src/overlay.html"]
---

# OpenJarvis frontend redesign: direction contract

Status: LOCKED by the user in the Impeccable direction round (workflow wf_ccf5697ecad88251).
Development-only contract. Never copy any of this into source, comments, DOM, data attributes, bundles or any browser-delivered file. Later steps pass it to the surface brief (`impeccable surface-brief write frontend/src/App.tsx <this file> ...`) and to the finish reviewer.

## Scope and mode

- Scope: the whole app. Every page (Chat, Today & Brief, Agents, Data Sources, Overview/Dashboard, Logs, Settings, Walkthrough/Get Started), the model picker modal (Installed Models, Download, Cloud Models), the System panel, the command palette, the setup flows, dialogs, toasts and every state (empty, loading, streaming, error, offline). Browser and Tauri desktop share this frontend.
- Mode: Operate. Build path: code-led. No image generation exists, so there are no comps; the chosen card's HTML sketch is the composition reference: `d:\OpenSource\OpenJarvis\.worktrees\frontend-redesign\.impeccable\mocks\decision\pick-transit.html`.
- Constraints: all current behaviour, routes, shortcuts and API/data contracts with the Python backend stay unchanged. No Python changes. No gradients, no emojis, no glass/blur, no glow.

## Chosen direction

**Transit Network**, from the 1972 Vignelli New York subway diagram and the Unimark wayfinding programmes. Card kind: `pick` (Impeccable's own top-ranked grounded candidate; the user chose it over the roll's assigned "Computation Pad").

## Theme decision

Ship **both** themes, **dark by default**. Physical scene: one developer-student at a desk all day, often in the evening under room light, switching between this app, an editor and a terminal; dark is the default ground, and light is a full first-class theme for daylight, never an inversion. Each theme derives its own values and is checked separately: text at 4.5:1 or better, route lines, station dots and focus marks at 3:1 or better against their ground. The theme toggle keeps the app's existing mechanism (`.dark` class) and persists the user's choice.

## Direction contract

THESIS: The assistant is a network. Every request rides a line from this device through engine, tools and model, and the app draws that route. It refuses the category default of a neutral chat column with a floating model dropdown and a stats drawer nobody opens.

OWN-WORLD: A black signage strip (sidebar) with white grotesk and white circular letter bullets. Work grounds: dark #141414 with #1C1C1C surfaces and #2E2E2E rules; light #FAFAF7 with white surfaces and #DDDDD8 rules. Route colours mean engine family, never page: local engines green #00933C, cloud providers orange #FF6319, tools and connectors yellow #FCCC0A, memory and data brown #996633. Action and selection use one blue (light #0039A6, dark re-derived to pass 3:1). Red #EE352E is for failures only. Lines are 5px strokes on 0/45/90-degree angles, and stations are open circles. Rectangles have 0 to 2px radius; circles appear only as stations and bullets. Elevation comes from 4px rule bars, never shadow. Type is one neo-grotesk, Archivo, self-hosted for Tauri offline use; ids, values and code use JetBrains Mono with tabular numerals.

STORY: The user sees which engine and model will answer before sending. They see what each reply actually did: its route, tools, time and cost. They trust local-first because the green line is visible and cloud spend is explicit. Then they switch models, agents or sources without hunting.

FIRST VIEWPORT (Chat, 1440x900): The 232px black strip holds the OpenJarvis wordmark over a 4px white rule, the eight pages as letter bullets with the active one inverted, then conversations. The centre has a 64px top bar with the conversation title, a model pill (line dot, model id, engine) that opens the model picker, and the agent at right. Below it, messages: user turns are solid blocks, and each assistant reply opens with its route strip. The composer sits at the bottom with Deep Research, Mic and Send; Send is the primary action, bottom right of the centre column, in the action blue. On the right, a 320px System panel holds the Network line map of engines with status (running, unavailable, ok with latency, error code in red), then Device, then This session (cost against all-cloud, local energy).

Signature interaction: the route strip. Its stations come only from real telemetry and tool-call data (device, engine, each tool call, model with latency), with no invented stations. While a reply streams, stations fill in order and the line draws along one axis. Hovering or focusing a station shows its figures, which replaces today's X-Ray footer. Reduced motion draws the strip complete, with no animation.

Motion grammar: single-axis, 120 to 200ms ease-out, no bounce, no scale-on-hover. State changes restyle in place without reflow.

Cross-surface reach: The model picker groups models by line (Installed = green, Cloud = orange), each model a station with service state. Settings shows engines and providers as the network list. Agents shows each agent as a line, with scheduled and past runs as stations. Logs and traces become routes. Data Sources shows connectors as stations on the data line with sync status. Overview shows cost and energy against the all-cloud comparison. Today & Brief and Walkthrough use the same strip, rules and bullets.

Honest risk and mitigations: The subway-map pipeline is a familiar developer-tool metaphor. It stays honest because only real routes are drawn. Colour turns to confetti without discipline, so colour belongs to engine families only: navigation, headings and decoration never get a line colour, and no screen shows more than the families actually present in its data.

FORM: Transit Network, position 1 on the ordered grounded list (Impeccable's pick, chosen over the assigned candidate 3). seed:229fffcb2fc83666

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved for the build

- The exact dark-theme blue, and any lifted line tints dark mode needs, must be measured against the contrast floors above.
- How the four line colours map onto every engine and provider the backend reports (for example, whether nim, groq and openrouter all count as cloud orange) comes from the backend's engine and provider fields, not from new categories.
