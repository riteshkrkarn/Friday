# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Primary user: the repository owner, a developer and student using OpenJarvis as a personal assistant for daily work and learning. The broader confirmed audience is people who want a personal AI assistant, including developers and users who may operate agents, presets, tools, and local models.

## Product Purpose

OpenJarvis makes a personalized personal AI assistant practical on personal devices. It combines chat, agents, tools, memory, connectors, scheduled workflows, local inference, and evaluation while reducing dependence on cloud services.

## Positioning

OpenJarvis is a personalized local-first personal AI assistant. Its distinguishing system treats shared agent primitives, on-device execution, energy and cost efficiency, learning from local traces, and composable skills as first-class parts of the product.

## Operating Context

The user may access OpenJarvis through the graphical browser interface or a Tauri desktop application. Common workflows include conversational assistance, configuring data sources and inference providers, selecting agents and presets, running scheduled or continuous tasks, reviewing traces and logs, and managing memory and skills.

The project supports macOS, Linux, WSL2, and native Windows installation, with desktop GUI packages and source-checkout use.

## Capabilities and Constraints

- Personal assistant behavior and workflows must remain usable for chat, agents, tools, memory, schedules, and model configuration.
- Python 3.11-3.13 is the backend runtime range.
- The existing web stack is React 19, TypeScript, Vite, Tailwind CSS, Base UI, Zustand, and Node.js 22+.
- The desktop application uses Tauri alongside the React frontend.
- Apache 2.0 is the project license.
- OpenJarvis is in an alpha development state.
- Durable product facts about broader secondary audiences, deployment preferences, and unsupported environments should remain explicitly confirmed rather than assumed.

## Brand Commitments

- Product name: OpenJarvis.
- Existing tagline: "Personal AI, On Personal Devices."
- The user defined this use as a personalized personal assistant.
- Existing visual and brand assets include the horizontal and circular OpenJarvis logos and the OpenJarvis demo reel under `assets/`.
- Voice and visual-world expansion are not recorded here; future design work should first preserve or document the incumbent implementation.

## Evidence on Hand

- Project overview and positioning: `README.md`
- Existing logos and demo reel: `assets/OpenJarvis_Horizontal_Logo.png`, `assets/OpenJarvis_Circular_Logo.png`, `assets/openjarvis_demo_reel.webp`
- Browser UI entry point and routes: `frontend/src/App.tsx`
- Desktop UI entry point: `desktop/src-tauri/` and `frontend/src/`
- Package and runtime constraints: `pyproject.toml` and `frontend/package.json`
- No user-provided testimonials, customer claims, or benchmark assertions were introduced by init.

## Product Principles

- Personalization should make the assistant useful to the individual without losing local-first control.
- Local execution and efficient use of compute, energy, latency, and cost should remain explicit product considerations.
- Composable primitives and skills should preserve flexibility for developers and advanced users.
- Desktop, browser, configuration, chat, and agent workflows should feel like one coherent personal AI system.
- Real project capabilities and assets take precedence over invented claims or demonstrations.

