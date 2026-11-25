"""Tests for repetition tracking and confirmation-gated rule proposals."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from openjarvis.learning.repetition import RepetitionStore
from openjarvis.server import repetition_routes


@pytest.fixture()
def store(tmp_path):
    s = RepetitionStore(str(tmp_path / "rep.db"))
    yield s
    s.close()


def test_proposes_rule_at_threshold_and_never_acts_without_confirmation(store):
    assert store.record_event("save:hackathon", "save hackathons", weekday="Monday") is None
    assert store.record_event("save:hackathon", "save hackathons", weekday="Monday") is None

    # 3rd repeat reaches default threshold=3
    rule = store.record_event(
        "save:hackathon",
        "save hackathons",
        weekday="Monday",
        suggested_schedule="0 9 * * 1",
    )
    assert rule is not None
    assert rule.count == 3
    assert rule.status == "proposed"
    assert rule.confirmed is False
    assert "Monday" in rule.proposal_text
    # Must NOT be executable before user confirms
    assert store.can_execute_rule(rule.id) is False

    # 4th repeat does not create a duplicate rule
    assert store.record_event("save:hackathon", "save hackathons", weekday="Monday") is None
    assert len(store.list_rules()) == 1


def test_accept_change_and_reject_rule_decisions(store):
    for _ in range(3):
        r1 = store.record_event("ask:brief", "ask for morning brief")
    assert r1 is not None

    accepted = store.decide_rule(r1.id, "accept")
    assert accepted is not None
    assert accepted.status == "accepted"
    assert accepted.confirmed is True
    assert store.can_execute_rule(r1.id) is True

    # Change (edit + accept)
    for _ in range(3):
        r2 = store.record_event("save:project", "log project progress")
    assert r2 is not None
    changed = store.decide_rule(
        r2.id,
        "change",
        updated_prompt="Remind me every Friday at 5pm",
        updated_schedule="0 17 * * 5",
    )
    assert changed is not None
    assert changed.status == "accepted"
    assert changed.proposal_text == "Remind me every Friday at 5pm"
    assert changed.suggested_schedule == "0 17 * * 5"
    assert store.can_execute_rule(r2.id) is True

    # Reject
    for _ in range(3):
        r3 = store.record_event("open:logs", "check server logs")
    assert r3 is not None
    rejected = store.decide_rule(r3.id, "reject")
    assert rejected is not None
    assert rejected.status == "rejected"
    assert rejected.confirmed is False
    assert store.can_execute_rule(r3.id) is False


def test_repetition_routes(tmp_path, monkeypatch):
    db_file = str(tmp_path / "api_rep.db")
    monkeypatch.setattr(repetition_routes, "_open_store", lambda: RepetitionStore(db_file))

    app = FastAPI()
    app.include_router(repetition_routes.router)
    client = TestClient(app)

    for idx in range(2):
        r = client.post(
            "/v1/repetitions/track",
            json={"action_key": "save:hack", "label": "save hackathons", "weekday": "Monday"},
        )
        assert r.status_code == 200
        assert r.json()["proposed_rule"] is None

    r3 = client.post(
        "/v1/repetitions/track",
        json={"action_key": "save:hack", "label": "save hackathons", "weekday": "Monday"},
    )
    assert r3.status_code == 200
    proposed = r3.json()["proposed_rule"]
    assert proposed is not None
    rule_id = proposed["id"]

    listed = client.get("/v1/repetitions/rules", params={"status": "proposed"})
    assert listed.status_code == 200
    assert listed.json()["count"] == 1

    decided = client.post(
        f"/v1/repetitions/rules/{rule_id}/decide",
        json={"decision": "accept"},
    )
    assert decided.status_code == 200
    assert decided.json()["confirmed"] is True

    bad = client.post(
        f"/v1/repetitions/rules/{rule_id}/decide",
        json={"decision": "invalid"},
    )
    assert bad.status_code == 400
