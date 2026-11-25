"""Tests for personalized morning brief and remembered report preferences."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from openjarvis.reports.morning_brief import (
    DEFAULT_BRIEF_SECTIONS,
    BriefPreferencesStore,
    generate_morning_brief,
)
from openjarvis.server import brief_routes
from openjarvis.tools.item_store import ItemStore


@pytest.fixture()
def stores(tmp_path):
    db_file = str(tmp_path / "brief.db")
    item_store = ItemStore(db_file)
    prefs_store = BriefPreferencesStore(db_file)
    yield item_store, prefs_store
    item_store.close()
    prefs_store.close()


def test_morning_brief_priority_order_and_preferences(stores):
    item_store, prefs_store = stores
    today = date(2026, 11, 25)

    item_store.add_item("Submit Hack Demo", "hackathon", due_date="2026-11-25")
    item_store.add_item("Won Best AI Tool", "achievement")
    item_store.add_item("Write Unit Tests", "task")
    item_store.add_item("Friday UI", "project", status="in_progress")

    brief = generate_morning_brief(item_store, prefs_store, today=today)
    assert list(brief.sections.keys()) == DEFAULT_BRIEF_SECTIONS
    assert brief.synthesized_by == "template"

    # Verify ordering in text: Today's Deadlines -> Pending Updates -> Open Tasks
    pos_deadlines = brief.text.index("Today's & Overdue Deadlines")
    pos_updates = brief.text.index("Pending Resume / Portfolio Updates")
    pos_tasks = brief.text.index("Open Tasks")
    assert pos_deadlines < pos_updates < pos_tasks

    # Apply natural-language preference updates and verify persistence
    prefs_store.apply_instruction("remove open tasks")
    prefs_store.apply_instruction("include projects")

    updated_brief = generate_morning_brief(item_store, prefs_store, today=today)
    assert "open_tasks" not in updated_brief.sections
    assert "projects" in updated_brief.sections
    assert "Open Tasks:" not in updated_brief.text
    assert "Active Projects:" in updated_brief.text


def test_morning_brief_llm_synthesis_and_fallback(stores):
    item_store, prefs_store = stores
    today = date(2026, 11, 25)
    item_store.add_item("Demo Today", "task", due_date="2026-11-25")

    engine = MagicMock()
    engine.generate.return_value = {"content": "Good morning! Today: Demo Today."}
    brief = generate_morning_brief(
        item_store,
        prefs_store,
        engine=engine,
        model="nvidia/nemotron-3-ultra-550b-a55b",
        today=today,
    )
    assert brief.synthesized_by == "llm"
    assert brief.text == "Good morning! Today: Demo Today."

    # Fallback to template if LLM raises
    failing_engine = MagicMock()
    failing_engine.generate.side_effect = RuntimeError("timeout")
    fallback = generate_morning_brief(
        item_store,
        prefs_store,
        engine=failing_engine,
        model="nvidia/nemotron-3-ultra-550b-a55b",
        today=today,
    )
    assert fallback.synthesized_by == "template"
    assert "Demo Today" in fallback.text


def test_brief_routes(tmp_path, monkeypatch):
    db_file = str(tmp_path / "api_brief.db")
    monkeypatch.setattr(brief_routes, "_open_item_store", lambda: ItemStore(db_file))
    monkeypatch.setattr(
        brief_routes, "_open_prefs_store", lambda: BriefPreferencesStore(db_file)
    )

    with ItemStore(db_file) as s:
        s.add_item("Today Hack", "hackathon", due_date=date.today().isoformat())
        s.add_item("Open Task 1", "task")

    app = FastAPI()
    app.include_router(brief_routes.router)
    client = TestClient(app)

    r1 = client.get("/v1/brief")
    assert r1.status_code == 200
    assert "deadlines_today" in r1.json()["sections"]
    assert "open_tasks" in r1.json()["sections"]

    pref_upd = client.post(
        "/v1/brief/preferences",
        json={"instruction": "exclude open tasks"},
    )
    assert pref_upd.status_code == 200
    assert "open_tasks" in pref_upd.json()["excluded_sections"]

    r2 = client.get("/v1/brief")
    assert r2.status_code == 200
    assert "open_tasks" not in r2.json()["sections"]

    bad = client.post("/v1/brief/preferences", json={"exclude": "nonexistent"})
    assert bad.status_code == 400
