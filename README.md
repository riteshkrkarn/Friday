<div align="center">
  <img alt="OpenJarvis" src="assets/OpenJarvis_Horizontal_Logo.png" width="360">

  <h1>Second Me</h1>
  <p><i>A personal AI assistant built on top of <a href="https://github.com/open-jarvis/OpenJarvis">OpenJarvis</a> (Apache 2.0).</i></p>

  <p>
    <img src="https://img.shields.io/badge/base-OpenJarvis-blue" alt="Base: OpenJarvis">
    <img src="https://img.shields.io/badge/python-3.11%E2%80%933.13-blue" alt="Python 3.11-3.13">
    <img src="https://img.shields.io/badge/inference-NVIDIA%20NIM%20%2B%20Groq-ff5722" alt="Inference: NVIDIA NIM + Groq">
    <img src="https://img.shields.io/badge/license-Apache%202.0-green" alt="License: Apache 2.0">
  </p>
</div>

---

## Overview

**Second Me** is a personal assistant designed to sit beside you throughout your daily workflow on Windows. Built on the OpenJarvis agentic runtime and trace/memory primitives, it is tailored to remember your **projects, hackathons, deadlines, achievements, bills, and expected income**, surface timely reminders, generate personalized briefings, and learn from your repeated habits.

---

## Current Architecture

- **Inference Layer (Cloud-First, Free Tier):**
  - **NVIDIA NIM** (`nvidia/nemotron-3-ultra-550b-a55b`, `minimaxai/minimax-m3.1-flash`, `nvidia/nemotron-3.5-super-vl-120b-a12b`, `meta/muse-glimmer-30b`, `nvidia/nemotron-3.5-bolt-e4b`)
  - **Groq** (`groq/openai/gpt-oss-120b`, `groq/qwen/qwen3.8-27b`, `groq/openai/gpt-oss-20b`, `groq/allam-2-7b`)
  - Swappable multi-engine router (`multi`) with automatic `.env` credential loading (`NIM_API_KEY`, `GROQ_API_KEY`).
- **Backend Server (`src/openjarvis/server`):**
  - FastAPI OpenAI-compatible API server (`jarvis serve`) with tool-calling agent loop (`orchestrator` / `native_openhands`), SSE streaming, SQLite persistence, and real-time console request/latency logging.
- **Frontend (`frontend/`):**
  - React 19 + TypeScript + Vite + Tailwind CSS UI featuring a **Nordic Hardware** dark-first theme (with light mode toggle), top hardware telemetry strip, `⌘K` model & cloud key palette, Deep Research mode, Agents, Data Sources, Logs, and Dashboard.

---

## Quick Start

### 1. Configure API Keys
Create a `.env` file in the repository root with your free-tier cloud keys:

```env
NIM_API_KEY=nvapi-...
GROQ_API_KEY=gsk_...
```

### 2. Start the Backend
```powershell
uv run jarvis serve
```
The API server starts on `http://127.0.0.1:8000` with live request and engine telemetry logs.

### 3. Start the Frontend (Dev Mode)
```powershell
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser (or run `npm run build` to bundle into `src/openjarvis/server/static/`).

### 4. Run Tests
```powershell
# Backend cloud key & model endpoint tests
$env:PYTHONPATH="src"; uv run pytest tests/engine/test_cloud_endpoints.py -v

# Frontend unit tests
cd frontend; npm test
```

---

## Roadmap (`PLAN.md`)

### v1 Scope
1. **Quick Capture by Voice:** Double-tap Right `Ctrl` (configurable hotkey) to record voice notes -> STT (local Whisper first, Deepgram fallback) -> save directly to the item store, with Telegram text fallback.
2. **Item Store (SQLite):** Track `hackathon`, `project`, `task`, `achievement`, `bill`, and `income` items with title, type, deadline/due date, amount (for bills and income), status, notes, and created date — searchable and filterable by type, status, and date. Supports recurring or one-time bills and expected income (e.g., salary or stipend).
3. **Smart Reminders:** Daily check of upcoming deadlines with configurable lead time, resume/portfolio update reminders for completed projects/wins, advance **bill due reminders**, and **expected income tracking** (notifying when due and flagging if late). Delivery order: Email -> Telegram -> Web UI.
4. **Personalized Reports:** Morning brief and custom reports built from your saved items, deadlines, pending updates, bills/income, and priorities.
5. **Repetition Learning:** Tracks repeated requests/patterns and proposes new automation rules after a repeat threshold (default: 3), always requiring confirmation before acting.
6. **Cloud Model Setup & Tests:** Swappable NIM/Groq inference backed by automated endpoint and key verification tests.

### Finance & Privacy (v1)
- Bills and income are added manually via voice or text (no bank login integration in v1).
- Never stores bank passwords, card numbers, or account numbers.
- Prompts sent to cloud endpoints (NVIDIA NIM / Groq) include the text you send; local-model routing for sensitive finance queries is planned as a future option.

### Later (Post-v1)
- **Achievement Prompts:** Post-win/project prompts to update resume or portfolio items.
- **Interactive Career & Workload Discussion:** Grounded in your saved item history.
- **Schedule Generation:** Daily/weekly time-blocking suggestions derived from open tasks and deadlines.

### Out of Scope
- Automated portfolio/resume file export.
- Local LLM inference (v1 uses cloud endpoints).

---

## Base Project & Attribution

This project is built on **[OpenJarvis](https://github.com/open-jarvis/OpenJarvis)** (*Personal AI, On Personal Devices*), created as part of the Intelligence Per Watt initiative at Hazy Research and the Scaling Intelligence Lab at Stanford SAIL.

<details>
<summary>OpenJarvis Citation</summary>

```bibtex
@misc{saadfalcon2026openjarvispersonalaipersonal,
      title={OpenJarvis: Personal AI, On Personal Devices}, 
      author={Jon Saad-Falcon and Avanika Narayan and Robby Manihani and Tanvir Bhathal and Herumb Shandilya and Hakki Orhun Akengin and Gabriel Bo and Andrew Park and Matthew Hart and Caia Costello and Chuan Li and Christopher Ré and Azalia Mirhoseini},
      year={2026},
      eprint={2605.17172},
      archivePrefix={arXiv},
      primaryClass={cs.LG},
      url={https://arxiv.org/abs/2605.17172}, 
}
```

</details>

## License

[Apache 2.0](LICENSE)
