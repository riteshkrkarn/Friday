"""Reminder routes — preview, trigger, and Web UI notification endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from openjarvis.reminders.service import (
    DEFAULT_REMINDER_EMAIL,
    WebNotificationStore,
    build_reminder_digest,
    run_daily_reminders,
)
from openjarvis.tools.item_store import ItemStore

router = APIRouter(prefix="/v1/reminders", tags=["reminders"])


class RunRemindersRequest(BaseModel):
    within_days: int = 2
    email_to: str = DEFAULT_REMINDER_EMAIL
    telegram_chat_id: str = ""


def _open_item_store() -> ItemStore:
    return ItemStore()


def _open_web_store() -> WebNotificationStore:
    return WebNotificationStore()


@router.get("/preview")
async def preview_reminders(within_days: int = Query(default=2, ge=0, le=365)):
    """Preview upcoming/overdue deadlines and pending resume/portfolio updates."""
    with _open_item_store() as store:
        digest = build_reminder_digest(store, within_days=within_days)
        return {
            "has_items": digest.has_items,
            "subject": digest.subject,
            "body": digest.body,
            "overdue": [i.to_dict() for i in digest.overdue],
            "upcoming": [i.to_dict() for i in digest.upcoming],
            "pending_updates": [i.to_dict() for i in digest.pending_updates],
        }


@router.post("/run")
async def trigger_reminders(body: Optional[RunRemindersRequest] = None):
    """Run the daily reminder check and deliver across Email -> Telegram -> Web UI."""
    req = body or RunRemindersRequest()
    with _open_item_store() as store, _open_web_store() as web_store:
        digest, report = run_daily_reminders(
            store=store,
            web_store=web_store,
            within_days=req.within_days,
            email_to=req.email_to,
            telegram_chat_id=req.telegram_chat_id,
        )
        return {
            "has_items": digest.has_items,
            "subject": digest.subject,
            "delivered_via": report.delivered_via,
            "failed_channels": report.failed_channels,
            "web_notification_id": report.web_notification_id,
            "skipped": report.skipped,
        }


@router.get("/notifications")
async def list_notifications(
    unread_only: bool = Query(default=True),
    limit: int = Query(default=50, ge=1, le=500),
):
    """List Web UI reminder notifications."""
    with _open_web_store() as web_store:
        items = web_store.list_notifications(unread_only=unread_only, limit=limit)
        return {"notifications": items, "count": len(items)}


@router.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str):
    """Mark a Web UI reminder notification as read."""
    with _open_web_store() as web_store:
        if not web_store.mark_read(notif_id):
            raise HTTPException(
                status_code=404, detail=f"Notification {notif_id!r} not found"
            )
        return {"id": notif_id, "is_read": True}
