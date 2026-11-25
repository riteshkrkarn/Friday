"""Tests for Friday daily reminders, ordered delivery, scheduler, and API."""

from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from openjarvis.reminders.service import (
    DEFAULT_REMINDER_EMAIL,
    WebNotificationStore,
    build_reminder_digest,
    deliver_reminder,
    register_reminder_jobs,
    run_daily_reminders,
)
from openjarvis.scheduler.scheduler import TaskScheduler
from openjarvis.scheduler.store import SchedulerStore
from openjarvis.server import reminder_routes
from openjarvis.tools.item_store import ItemStore


@pytest.fixture()
def stores(tmp_path):
    db_file = str(tmp_path / "items.db")
    item_store = ItemStore(db_file)
    web_store = WebNotificationStore(db_file)
    yield item_store, web_store
    item_store.close()
    web_store.close()


def test_build_reminder_digest_categorizes_overdue_upcoming_and_updates(stores):
    item_store, _ = stores
    today = date(2026, 11, 25)

    item_store.add_item("Overdue Task", "task", due_date="2026-11-23")
    item_store.add_item("Tomorrow Hack", "hackathon", due_date="2026-11-26")
    item_store.add_item("Far Task", "task", due_date="2026-12-15")
    item_store.add_item("Won Hackathon", "achievement")  # needs_update=True

    digest = build_reminder_digest(item_store, within_days=3, today=today)
    assert digest.has_items is True
    assert [i.title for i in digest.overdue] == ["Overdue Task"]
    assert [i.title for i in digest.upcoming] == ["Tomorrow Hack"]
    assert [i.title for i in digest.pending_updates] == ["Won Hackathon"]
    assert "OVERDUE DEADLINES" in digest.body
    assert "UPCOMING DEADLINES" in digest.body
    assert "PENDING RESUME / PORTFOLIO UPDATES" in digest.body


def test_build_reminder_digest_empty_when_all_clear(stores):
    item_store, _ = stores
    digest = build_reminder_digest(item_store, within_days=2, today=date(2026, 11, 25))
    assert digest.has_items is False


def test_deliver_reminder_order_and_fallbacks(stores):
    item_store, web_store = stores
    today = date(2026, 11, 25)
    item_store.add_item("Submit Demo", "hackathon", due_date="2026-11-26")

    call_order = []
    email_ch = MagicMock()
    email_ch.send_message.side_effect = lambda *a, **kw: call_order.append("email")
    tg_ch = MagicMock()
    tg_ch.send_message.side_effect = lambda *a, **kw: call_order.append("telegram")

    digest, report = run_daily_reminders(
        store=item_store,
        web_store=web_store,
        within_days=2,
        today=today,
        telegram_chat_id="999",
        email_channel=email_ch,
        telegram_channel=tg_ch,
    )
    assert digest.has_items is True
    assert call_order == ["email", "telegram"]
    assert report.delivered_via == ["email", "telegram", "web"]
    assert report.web_notification_id is not None
    email_ch.send_message.assert_called_once()
    assert email_ch.send_message.call_args[0][0] == DEFAULT_REMINDER_EMAIL

    # If email fails, Telegram and Web UI still receive the reminder
    failing_email = MagicMock()
    failing_email.send_message.side_effect = RuntimeError("SMTP down")
    report2 = deliver_reminder(
        digest,
        telegram_chat_id="999",
        email_channel=failing_email,
        telegram_channel=tg_ch,
        web_store=web_store,
    )
    assert report2.delivered_via == ["telegram", "web"]
    assert "SMTP down" in report2.failed_channels["email"]


def test_register_reminder_jobs_is_idempotent(tmp_path):
    sched_store = SchedulerStore(str(tmp_path / "sched.db"))
    try:
        scheduler = TaskScheduler(sched_store)
        id1 = register_reminder_jobs(scheduler, cron_expr="0 8 * * *", within_days=3)
        id2 = register_reminder_jobs(scheduler, cron_expr="0 8 * * *", within_days=3)
        assert id1 == id2
        tasks = scheduler.list_tasks()
        assert len(tasks) == 1
        assert tasks[0].schedule_value == "0 8 * * *"
    finally:
        sched_store.close()


def test_reminder_routes_preview_run_and_notifications(tmp_path, monkeypatch):
    db_file = str(tmp_path / "routes_rem.db")
    monkeypatch.setattr(reminder_routes, "_open_item_store", lambda: ItemStore(db_file))
    monkeypatch.setattr(
        reminder_routes, "_open_web_store", lambda: WebNotificationStore(db_file)
    )
    # Ensure no real email/telegram env vars interfere
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)

    with ItemStore(db_file) as s:
        s.add_item("Tomorrow Deadline", "task", due_date=(date.today() + timedelta(days=1)).isoformat())

    app = FastAPI()
    app.include_router(reminder_routes.router)
    client = TestClient(app)

    prev = client.get("/v1/reminders/preview", params={"within_days": 2})
    assert prev.status_code == 200
    assert prev.json()["has_items"] is True
    assert len(prev.json()["upcoming"]) == 1

    run = client.post("/v1/reminders/run", json={"within_days": 2})
    assert run.status_code == 200
    run_data = run.json()
    assert run_data["delivered_via"] == ["web"]
    notif_id = run_data["web_notification_id"]
    assert notif_id

    notifs = client.get("/v1/reminders/notifications", params={"unread_only": True})
    assert notifs.status_code == 200
    assert notifs.json()["count"] == 1

    read_resp = client.post(f"/v1/reminders/notifications/{notif_id}/read")
    assert read_resp.status_code == 200
    assert client.get("/v1/reminders/notifications", params={"unread_only": True}).json()["count"] == 0
