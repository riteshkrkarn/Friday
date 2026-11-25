"""Telegram fallback handler for Second Me quick capture."""

from __future__ import annotations

from typing import Any, Optional

from openjarvis.capture.quick_capture import CaptureResult, capture_text
from openjarvis.tools.item_store import ItemStore


def format_capture_confirmation(result: CaptureResult) -> str:
    """Format a concise confirmation message for a captured item."""
    due = f" (due {result.item.due_date})" if result.item.due_date else ""
    return f"Saved [{result.item.item_type}]: {result.item.title}{due}"


def handle_telegram_capture(
    text: str,
    *,
    store: Optional[ItemStore] = None,
    engine: Any = None,
    model: Optional[str] = None,
) -> str:
    """Parse and save a Telegram capture message, returning a confirmation reply."""
    cleaned = text.strip()
    if cleaned.lower().startswith("/capture"):
        cleaned = cleaned[len("/capture") :].strip()
    if not cleaned:
        return "Usage: /capture <note, deadline, hackathon, project, or achievement>"

    result = capture_text(cleaned, store=store, engine=engine, model=model)
    return format_capture_confirmation(result)


def register_telegram_capture_handler(
    channel: Any,
    *,
    store: Optional[ItemStore] = None,
    engine: Any = None,
    model: Optional[str] = None,
) -> None:
    """Attach a capture handler to a TelegramChannel (or compatible BaseChannel)."""

    def _on_message(msg: Any) -> None:
        content = getattr(msg, "content", "") or ""
        if not content.strip():
            return
        reply = handle_telegram_capture(
            content,
            store=store,
            engine=engine,
            model=model,
        )
        sender_id = getattr(msg, "sender_id", "")
        if sender_id and hasattr(channel, "send_message"):
            channel.send_message(sender_id, reply)

    channel.on_message(_on_message)
