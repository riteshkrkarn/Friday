<div align="center">
  <img alt="Friday" src="assets/Friday_Horizontal_Logo.jpg" width="420">

  <h1>Friday</h1>
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

**Friday** is a personal assistant designed to sit beside you throughout your daily workflow on Windows. Built on the OpenJarvis agentic runtime and trace/memory primitives, it is tailored to remember your **projects, hackathons, deadlines, and achievements**, surface timely reminders, generate personalized briefings, and learn from your repeated habits.

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
# Friday backend unit tests (offline, mocked)
$env:PYTHONPATH="src;.venv\Lib\site-packages"; pytest tests/server/test_cloud_key_setup.py tests/tools/test_item_store.py tests/capture/test_quick_capture.py tests/reminders/test_reminders.py tests/reports/test_morning_brief.py tests/learning/test_repetition.py -q

# Live cloud endpoint tests (requires network + .env keys)
$env:PYTHONPATH="src"; uv run pytest tests/engine/test_cloud_endpoints.py -v

# Frontend unit tests
cd frontend; npm test
```

---

## Implementation Status & Roadmap (`PLAN.md`)

### v1 Status
1. **Cloud Model Setup & Tests — Done:** Swappable NIM/Groq inference backed by [test_cloud_key_setup.py](tests/server/test_cloud_key_setup.py) and [test_cloud_endpoints.py](tests/engine/test_cloud_endpoints.py).
2. **Item Store (SQLite + Tool + API) — Done:** Tracks `hackathon`, `project`, `task`, and `achievement` items with title, type, due date, status, `needs_update` flag, and notes via [item_store.py](src/openjarvis/tools/item_store.py), `item_store` agent tool, and `/v1/items` routes.
3. **Quick Capture Flow — Done:** Windows `Right Ctrl` double-tap hotkey listener ([hotkey_listener.py](src/openjarvis/capture/hotkey_listener.py)), Whisper-first / Deepgram-fallback STT ([quick_capture.py](src/openjarvis/capture/quick_capture.py)), Telegram `/capture` fallback ([telegram_fallback.py](src/openjarvis/capture/telegram_fallback.py)), and `POST /v1/items/capture`.
4. **Smart Reminders — Done:** Daily overdue/upcoming deadline checks and resume/portfolio update reminders ([service.py](src/openjarvis/reminders/service.py)) with ordered delivery (Email → Telegram → Jarvis Web UI) and `/v1/reminders` routes.
5. **Personalized Reports — Done:** Morning brief and custom reports ([morning_brief.py](src/openjarvis/reports/morning_brief.py)) built from your saved items and remembered include/exclude preferences via `/v1/brief`.
6. **Repetition Learning — Done:** Tracks repeated requests/patterns ([repetition.py](src/openjarvis/learning/repetition.py)) and proposes confirmation-gated rules after 3 repeats via `/v1/repetitions`, never acting without user confirmation.

### Later / v2
- **Finance (Bills & Income):** Manual voice/text tracking of recurring or one-time bills and expected income (deferred to v2).
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
