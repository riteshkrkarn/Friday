"""Tests for Second Me quick capture (STT fallback, extractor, hotkey, Telegram, API)."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from openjarvis.capture.hotkey_listener import DoubleTapDetector
from openjarvis.capture.quick_capture import (
    capture_audio,
    capture_text,
    extract_item_fields,
    transcribe_audio,
)
from openjarvis.capture.telegram_fallback import (
    handle_telegram_capture,
    register_telegram_capture_handler,
)
from openjarvis.server import item_routes
from openjarvis.tools.item_store import ItemStore


@pytest.fixture()
def store(tmp_path):
    s = ItemStore(str(tmp_path / "capture_items.db"))
    yield s
    s.close()


# ---------------------------------------------------------------------------
# STT: Whisper-first with Deepgram fallback
# ---------------------------------------------------------------------------


def test_transcribe_uses_whisper_when_fast():
    whisper = MagicMock()
    whisper.transcribe.return_value = SimpleNamespace(text="  finish demo tomorrow  ")
    deepgram = MagicMock()
    deepgram.health.return_value = True

    res = transcribe_audio(
        b"wav-bytes",
        latency_threshold_s=5.0,
        whisper_backend=whisper,
        deepgram_backend=deepgram,
    )
    assert res.backend_used == "faster-whisper"
    assert res.text == "finish demo tomorrow"
    deepgram.transcribe.assert_not_called()


def test_transcribe_falls_back_to_deepgram_when_whisper_slow_or_fails():
    whisper = MagicMock()
    whisper.transcribe.side_effect = RuntimeError("whisper unavailable")
    deepgram = MagicMock()
    deepgram.health.return_value = True
    deepgram.transcribe.return_value = SimpleNamespace(text="submit hackathon")

    res = transcribe_audio(
        b"wav-bytes",
        whisper_backend=whisper,
        deepgram_backend=deepgram,
    )
    assert res.backend_used == "deepgram"
    assert res.text == "submit hackathon"

    # Also falls back when Whisper exceeds latency threshold
    slow_whisper = MagicMock()
    slow_whisper.transcribe.return_value = SimpleNamespace(text="slow text")
    res_slow = transcribe_audio(
        b"wav-bytes",
        latency_threshold_s=-1.0,  # force threshold exceeded
        whisper_backend=slow_whisper,
        deepgram_backend=deepgram,
    )
    assert res_slow.backend_used == "deepgram"


# ---------------------------------------------------------------------------
# Extraction & ItemStore persistence
# ---------------------------------------------------------------------------


def test_extract_item_fields_llm_and_heuristic():
    fake_engine = MagicMock()
    fake_engine.generate.return_value = {
        "content": '```json\n{"title": "Global AI Hack", "item_type": "hackathon", "due_date": "2026-12-05", "notes": "team of 2"}\n```'
    }
    fields, used = extract_item_fields(
        "Remind me about Global AI Hack on Dec 5",
        engine=fake_engine,
        model="nvidia/nemotron-3-ultra-550b-a55b",
        today=date(2026, 11, 25),
    )
    assert used == "llm"
    assert fields["item_type"] == "hackathon"
    assert fields["due_date"] == "2026-12-05"

    # Heuristic fallback when no engine is passed
    h_fields, h_used = extract_item_fields(
        "Won 1st prize at college hackathon tomorrow",
        today=date(2026, 11, 25),
    )
    assert h_used == "heuristic"
    assert h_fields["item_type"] == "hackathon"
    assert h_fields["due_date"] == "2026-11-26"


def test_capture_audio_saves_item_in_store(store):
    whisper = MagicMock()
    whisper.transcribe.return_value = SimpleNamespace(
        text="Won best AI project award today"
    )
    res = capture_audio(
        b"wav-bytes",
        whisper_backend=whisper,
        store=store,
        today=date(2026, 11, 25),
    )
    assert res.item.item_type == "achievement"
    assert res.item.needs_update is True
    assert res.item.due_date == "2026-11-25"
    assert store.get_item(res.item.id) is not None


# ---------------------------------------------------------------------------
# Double-tap hotkey detector
# ---------------------------------------------------------------------------


def test_double_tap_detector_window_and_reset():
    now = [0.0]
    detector = DoubleTapDetector("ctrl_r", window_seconds=0.4, clock=lambda: now[0])

    assert detector.on_release("ctrl_r") is False  # first tap at t=0.0
    now[0] = 0.25
    assert detector.on_release("ctrl_r") is True  # second tap within 0.4s

    # Third tap starts a fresh cycle
    now[0] = 0.35
    assert detector.on_release("ctrl_r") is False

    # Other key resets pending tap
    now[0] = 0.45
    assert detector.on_release("a") is False
    now[0] = 0.50
    assert detector.on_release("ctrl_r") is False

    # Too slow (> 0.4s) does not trigger
    now[0] = 1.2
    assert detector.on_release("ctrl_r") is False


# ---------------------------------------------------------------------------
# Telegram fallback & /v1/items/capture route
# ---------------------------------------------------------------------------


def test_telegram_capture_and_handler(store):
    usage = handle_telegram_capture("/capture", store=store)
    assert "Usage:" in usage

    reply = handle_telegram_capture(
        "/capture Submit OpenJarvis project due 2026-12-10",
        store=store,
    )
    assert reply.startswith("Saved [project]:")
    assert "2026-12-10" in reply
    assert len(store.list_items(item_type="project")) == 1

    # Channel handler integration
    callbacks = []
    sent = []

    class FakeChannel:
        def on_message(self, cb):
            callbacks.append(cb)

        def send_message(self, chat_id, text):
            sent.append((chat_id, text))

    ch = FakeChannel()
    register_telegram_capture_handler(ch, store=store)
    callbacks[0](SimpleNamespace(sender_id="12345", content="Fix login bug tomorrow"))
    assert len(sent) == 1
    assert sent[0][0] == "12345"
    assert sent[0][1].startswith("Saved [task]:")


def test_capture_text_route(tmp_path, monkeypatch):
    db_file = str(tmp_path / "route_capture.db")
    monkeypatch.setattr(item_routes, "_open_store", lambda: ItemStore(db_file))

    app = FastAPI()
    app.include_router(item_routes.router)
    client = TestClient(app)

    resp = client.post(
        "/v1/items/capture",
        json={"text": "Build Second Me project due 2026-12-01"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["item"]["item_type"] == "project"
    assert data["item"]["due_date"] == "2026-12-01"
