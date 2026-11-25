"""Tests for ItemStore, ItemStoreTool, and /v1/items REST routes."""

from __future__ import annotations

import json
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from openjarvis.core.registry import ToolRegistry
from openjarvis.server import item_routes
from openjarvis.tools.item_store import ItemStore
from openjarvis.tools.item_tools import ItemStoreTool


@pytest.fixture()
def store(tmp_path):
    s = ItemStore(str(tmp_path / "items.db"))
    yield s
    s.close()


# ---------------------------------------------------------------------------
# ItemStore unit tests
# ---------------------------------------------------------------------------


def test_add_get_update_delete_roundtrip(store):
    item = store.add_item(
        "AI Agents Hackathon",
        "hackathon",
        due_date="2026-12-01",
        notes="Build Second Me prototype",
    )
    assert item.id
    assert item.title == "AI Agents Hackathon"
    assert item.item_type == "hackathon"
    assert item.status == "open"
    assert item.needs_update is False

    fetched = store.get_item(item.id)
    assert fetched is not None
    assert fetched.title == "AI Agents Hackathon"

    updated = store.update_item(
        item.id,
        status="done",
        notes="Submitted demo",
    )
    assert updated is not None
    assert updated.status == "done"
    assert updated.notes == "Submitted demo"

    assert store.delete_item(item.id) is True
    assert store.get_item(item.id) is None
    assert store.delete_item(item.id) is False


def test_achievement_and_completed_project_flag_needs_update(store):
    ach = store.add_item("Won 1st Place at Hack", "achievement")
    assert ach.needs_update is True

    proj = store.add_item("OpenJarvis Fork", "project", status="in_progress")
    assert proj.needs_update is False

    proj_done = store.update_item(proj.id, status="done")
    assert proj_done is not None
    assert proj_done.needs_update is True

    pending = store.pending_updates()
    assert {p.id for p in pending} == {ach.id, proj.id}

    cleared = store.update_item(ach.id, needs_update=False)
    assert cleared is not None and cleared.needs_update is False
    assert [p.id for p in store.pending_updates()] == [proj.id]


def test_list_filters_search_and_upcoming_deadlines(store):
    today = date(2026, 11, 25)
    store.add_item("Due Soon Hack", "hackathon", due_date=(today + timedelta(days=2)).isoformat())
    store.add_item("Later Task", "task", due_date=(today + timedelta(days=20)).isoformat(), notes="refactor")
    store.add_item("Done Task", "task", due_date=(today + timedelta(days=1)).isoformat(), status="done")
    store.add_item("No Date Project", "project", notes="Second Me UI")

    hacks = store.list_items(item_type="hackathon")
    assert [i.title for i in hacks] == ["Due Soon Hack"]

    search_hits = store.list_items(query="second me")
    assert [i.title for i in search_hits] == ["No Date Project"]

    due_window = store.list_items(due_before=(today + timedelta(days=5)).isoformat(), status="open")
    assert [i.title for i in due_window] == ["Due Soon Hack"]

    upcoming = store.upcoming_deadlines(within_days=7, from_date=today)
    assert [i.title for i in upcoming] == ["Due Soon Hack"]


def test_validation_rejects_empty_title_and_invalid_type_or_status(store):
    with pytest.raises(ValueError, match="title"):
        store.add_item("   ", "task")
    with pytest.raises(ValueError, match="item_type"):
        store.add_item("Bill", "bill")
    with pytest.raises(ValueError, match="status"):
        store.add_item("Task", "task", status="invalid")


# ---------------------------------------------------------------------------
# ItemStoreTool tests
# ---------------------------------------------------------------------------


def test_item_store_tool_registered_and_executes(tmp_path):
    tool = ItemStoreTool(db_path=str(tmp_path / "tool_items.db"))
    assert tool.tool_id == "item_store"
    assert tool.spec.name == "item_store"

    add_res = tool.execute(
        action="add",
        title="Ship Item Store",
        item_type="task",
        due_date="2026-11-30",
    )
    assert add_res.success
    created = json.loads(add_res.content)

    list_res = tool.execute(action="list", item_type="task", query="Ship")
    assert list_res.success
    assert len(json.loads(list_res.content)) == 1

    upd_res = tool.execute(action="update", id=created["id"], status="done")
    assert upd_res.success
    assert json.loads(upd_res.content)["status"] == "done"

    del_res = tool.execute(action="delete", id=created["id"])
    assert del_res.success

    missing = tool.execute(action="get", id=created["id"])
    assert not missing.success


# ---------------------------------------------------------------------------
# /v1/items REST route tests
# ---------------------------------------------------------------------------


def test_item_routes_crud_and_filters(tmp_path, monkeypatch):
    db_file = str(tmp_path / "api_items.db")
    monkeypatch.setattr(item_routes, "_open_store", lambda: ItemStore(db_file))

    app = FastAPI()
    app.include_router(item_routes.router)
    client = TestClient(app)

    create_resp = client.post(
        "/v1/items",
        json={
            "title": "Demo Day",
            "item_type": "hackathon",
            "due_date": date.today().isoformat(),
            "notes": "Prepare pitch",
        },
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    item_id = created["id"]

    list_resp = client.get("/v1/items", params={"item_type": "hackathon", "q": "pitch"})
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] == 1

    upcoming_resp = client.get("/v1/items/upcoming", params={"within_days": 3})
    assert upcoming_resp.status_code == 200
    assert upcoming_resp.json()["count"] == 1

    patch_resp = client.patch(
        f"/v1/items/{item_id}",
        json={"status": "done", "needs_update": True},
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["needs_update"] is True

    pending_resp = client.get("/v1/items/pending-updates")
    assert pending_resp.status_code == 200
    assert pending_resp.json()["count"] == 1

    del_resp = client.delete(f"/v1/items/{item_id}")
    assert del_resp.status_code == 200
    assert client.get(f"/v1/items/{item_id}").status_code == 404

    bad_resp = client.post("/v1/items", json={"title": "Invalid", "item_type": "bill"})
    assert bad_resp.status_code == 400
