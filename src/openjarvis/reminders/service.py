"""Daily deadline & update-reminder checks with Email -> Telegram -> Web UI delivery."""

from __future__ import annotations

import logging
import os
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from openjarvis.core.friday_prompts import load_prompt
from openjarvis.core.paths import get_config_dir
from openjarvis.tools.item_store import Item, ItemStore

logger = logging.getLogger(__name__)

DEFAULT_REMINDER_EMAIL = "riteshkumarkarn414@gmail.com"


@dataclass(slots=True)
class ReminderDigest:
    """Computed reminder payload for upcoming deadlines and pending updates."""

    upcoming: List[Item] = field(default_factory=list)
    overdue: List[Item] = field(default_factory=list)
    pending_updates: List[Item] = field(default_factory=list)
    subject: str = ""
    body: str = ""

    @property
    def has_items(self) -> bool:
        return bool(self.upcoming or self.overdue or self.pending_updates)


@dataclass(slots=True)
class DeliveryReport:
    """Result of delivering a reminder across ordered channels."""

    delivered_via: List[str] = field(default_factory=list)
    failed_channels: Dict[str, str] = field(default_factory=dict)
    web_notification_id: Optional[str] = None
    skipped: bool = False


class WebNotificationStore:
    """SQLite store for Jarvis Web UI reminder notifications."""

    def __init__(self, db_path: str = "") -> None:
        if not db_path:
            db_path = str(get_config_dir() / "items.db")
        self._db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS web_notifications (
                id TEXT PRIMARY KEY,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                is_read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    def push(self, subject: str, body: str) -> str:
        notif_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()
        self._conn.execute(
            """
            INSERT INTO web_notifications (id, subject, body, is_read, created_at)
            VALUES (?, ?, ?, 0, ?)
            """,
            (notif_id, subject, body, now),
        )
        self._conn.commit()
        return notif_id

    def list_notifications(self, *, unread_only: bool = False, limit: int = 50) -> List[Dict[str, Any]]:
        where = "WHERE is_read = 0" if unread_only else ""
        cur = self._conn.execute(
            f"""
            SELECT id, subject, body, is_read, created_at
            FROM web_notifications
            {where}
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (max(1, min(int(limit), 500)),),
        )
        return [
            {
                "id": row[0],
                "subject": row[1],
                "body": row[2],
                "is_read": bool(row[3]),
                "created_at": row[4],
            }
            for row in cur.fetchall()
        ]

    def mark_read(self, notif_id: str) -> bool:
        cur = self._conn.execute(
            "UPDATE web_notifications SET is_read = 1 WHERE id = ?",
            (notif_id,),
        )
        self._conn.commit()
        return cur.rowcount > 0

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> WebNotificationStore:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


def build_reminder_digest(
    store: ItemStore,
    *,
    within_days: int = 2,
    today: Optional[date] = None,
) -> ReminderDigest:
    """Check overdue/upcoming deadlines and pending resume/portfolio updates."""
    ref_day = today or date.today()
    today_iso = ref_day.isoformat()

    upcoming = store.upcoming_deadlines(within_days=within_days, from_date=ref_day)
    # Overdue items: open or in_progress with due_date strictly before today
    all_active = [
        item
        for item in store.list_items(limit=500)
        if item.status not in ("done", "archived") and item.due_date
    ]
    overdue = [
        item for item in all_active if item.due_date[:10] < today_iso
    ]
    pending_updates = store.pending_updates()

    if not (overdue or upcoming or pending_updates):
        return ReminderDigest(
            upcoming=[],
            overdue=[],
            pending_updates=[],
            subject="Friday: All clear",
            body="No upcoming deadlines or pending resume/portfolio updates.",
        )

    lines: List[str] = []
    if overdue:
        lines.append("OVERDUE DEADLINES:")
        for item in overdue:
            lines.append(f"- [{item.item_type}] {item.title} (was due {item.due_date})")
    if upcoming:
        lines.append(f"UPCOMING DEADLINES (next {within_days}d):")
        for item in upcoming:
            lines.append(f"- [{item.item_type}] {item.title} (due {item.due_date})")
    if pending_updates:
        lines.append("PENDING RESUME / PORTFOLIO UPDATES:")
        for item in pending_updates:
            lines.append(f"- [{item.item_type}] {item.title}")

    parts = []
    if overdue:
        parts.append(f"{len(overdue)} overdue")
    if upcoming:
        parts.append(f"{len(upcoming)} upcoming")
    if pending_updates:
        parts.append(f"{len(pending_updates)} update(s)")
    subject = f"Friday Reminders: {', '.join(parts)}"

    return ReminderDigest(
        upcoming=upcoming,
        overdue=overdue,
        pending_updates=pending_updates,
        subject=subject,
        body="\n".join(lines),
    )


def _default_email_channel() -> Any:
    smtp_host = os.environ.get("SMTP_HOST", "")
    username = os.environ.get("EMAIL_USERNAME", "")
    if not (smtp_host and username):
        return None
    from openjarvis.channels.email_channel import EmailChannel

    return EmailChannel(
        smtp_host=smtp_host,
        smtp_port=int(os.environ.get("SMTP_PORT", "587")),
        username=username,
        password=os.environ.get("EMAIL_PASSWORD", ""),
    )


def _default_telegram_channel() -> Any:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return None
    from openjarvis.channels.telegram import TelegramChannel

    return TelegramChannel(bot_token=token)


def deliver_reminder(
    digest: ReminderDigest,
    *,
    email_to: str = DEFAULT_REMINDER_EMAIL,
    telegram_chat_id: str = "",
    email_channel: Any = None,
    telegram_channel: Any = None,
    web_store: Optional[WebNotificationStore] = None,
    force: bool = False,
) -> DeliveryReport:
    """Deliver a reminder in order: Email -> Telegram -> Jarvis Web UI."""
    if not digest.has_items and not force:
        return DeliveryReport(skipped=True)

    report = DeliveryReport()

    # 1. Email first
    em = email_channel if email_channel is not None else _default_email_channel()
    if em is not None and email_to:
        try:
            em.send_message(email_to, digest.body, subject=digest.subject)
            report.delivered_via.append("email")
        except Exception as exc:
            logger.warning("Email reminder delivery failed: %s", exc)
            report.failed_channels["email"] = str(exc)
    else:
        report.failed_channels["email"] = "not_configured"

    # 2. Telegram second
    chat_id = telegram_chat_id or os.environ.get("TELEGRAM_CHAT_ID", "")
    tg = telegram_channel if telegram_channel is not None else _default_telegram_channel()
    if tg is not None and chat_id:
        try:
            tg.send_message(chat_id, f"{digest.subject}\n\n{digest.body}")
            report.delivered_via.append("telegram")
        except Exception as exc:
            logger.warning("Telegram reminder delivery failed: %s", exc)
            report.failed_channels["telegram"] = str(exc)
    else:
        report.failed_channels["telegram"] = "not_configured"

    # 3. Jarvis Web UI (always stored so the web interface shows it)
    owns_web = web_store is None
    target_web = web_store or WebNotificationStore()
    try:
        report.web_notification_id = target_web.push(digest.subject, digest.body)
        report.delivered_via.append("web")
    finally:
        if owns_web:
            target_web.close()

    return report


def run_daily_reminders(
    *,
    store: Optional[ItemStore] = None,
    web_store: Optional[WebNotificationStore] = None,
    within_days: int = 2,
    today: Optional[date] = None,
    email_to: str = DEFAULT_REMINDER_EMAIL,
    telegram_chat_id: str = "",
    email_channel: Any = None,
    telegram_channel: Any = None,
) -> tuple[ReminderDigest, DeliveryReport]:
    """Compute today's reminder digest and deliver it across configured channels."""
    owns_store = store is None
    target_store = store or ItemStore()
    try:
        digest = build_reminder_digest(
            target_store,
            within_days=within_days,
            today=today,
        )
        report = deliver_reminder(
            digest,
            email_to=email_to,
            telegram_chat_id=telegram_chat_id,
            email_channel=email_channel,
            telegram_channel=telegram_channel,
            web_store=web_store,
        )
        return digest, report
    finally:
        if owns_store:
            target_store.close()


def register_reminder_jobs(
    scheduler: Any,
    *,
    cron_expr: str = "0 8 * * *",
    within_days: int = 2,
) -> str:
    """Register the daily Friday reminder & update-reminder cron job."""
    existing = scheduler.list_tasks()
    for task in existing:
        if task.metadata.get("second_me_job") == "daily_reminders":
            return task.id

    task = scheduler.create_task(
        prompt=load_prompt(
            "daily_reminders",
            fallback=(
                "Run daily Friday deadline (within {within_days} days) and "
                "resume/portfolio update reminders."
            ),
            within_days=within_days,
        ),
        schedule_type="cron",
        schedule_value=cron_expr,
        metadata={"second_me_job": "daily_reminders", "within_days": within_days},
    )
    return task.id
