"""Agent tool for managing Second Me items in ItemStore."""

from __future__ import annotations

import json
from typing import Any, Dict

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec
from openjarvis.tools.item_store import ITEM_STATUSES, ITEM_TYPES, ItemStore


@ToolRegistry.register("item_store")
class ItemStoreTool(BaseTool):
    """Create, search, filter, update, and delete personal items."""

    tool_id = "item_store"

    def __init__(self, db_path: str = "") -> None:
        self._db_path = db_path

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="item_store",
            description=(
                "Manage Second Me personal items (hackathons, projects, tasks, "
                "achievements): add, get, update, delete, list/search, check "
                "upcoming deadlines, or list pending resume/portfolio updates."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": [
                            "add",
                            "get",
                            "update",
                            "delete",
                            "list",
                            "upcoming",
                            "pending_updates",
                        ],
                        "description": "Operation to perform.",
                    },
                    "id": {"type": "string", "description": "Item ID (for get/update/delete)."},
                    "title": {"type": "string", "description": "Item title."},
                    "item_type": {
                        "type": "string",
                        "enum": list(ITEM_TYPES),
                        "description": "Item category.",
                    },
                    "due_date": {
                        "type": "string",
                        "description": "Deadline or due date (YYYY-MM-DD or ISO string).",
                    },
                    "status": {
                        "type": "string",
                        "enum": list(ITEM_STATUSES),
                        "description": "Item status.",
                    },
                    "needs_update": {
                        "type": "boolean",
                        "description": "Whether resume/portfolio still needs updating.",
                    },
                    "notes": {"type": "string", "description": "Additional notes."},
                    "query": {"type": "string", "description": "Text search query."},
                    "due_before": {"type": "string", "description": "Filter due_date <= value."},
                    "due_after": {"type": "string", "description": "Filter due_date >= value."},
                    "within_days": {
                        "type": "integer",
                        "description": "Days ahead for upcoming deadlines (default 7).",
                    },
                    "limit": {"type": "integer", "description": "Max results (default 50)."},
                },
                "required": ["action"],
            },
        )

    def _ok(self, payload: Any) -> ToolResult:
        return ToolResult(
            tool_name=self.tool_id,
            content=json.dumps(payload),
            success=True,
        )

    def _err(self, message: str) -> ToolResult:
        return ToolResult(
            tool_name=self.tool_id,
            content=message,
            success=False,
        )

    def execute(self, **kwargs: Any) -> ToolResult:
        action = str(kwargs.get("action", "")).strip().lower()
        try:
            with ItemStore(self._db_path) as store:
                if action == "add":
                    item = store.add_item(
                        title=str(kwargs.get("title", "")),
                        item_type=str(kwargs.get("item_type", "task")),
                        due_date=kwargs.get("due_date"),
                        status=str(kwargs.get("status", "open")),
                        needs_update=kwargs.get("needs_update"),
                        notes=str(kwargs.get("notes", "")),
                    )
                    return self._ok(item.to_dict())

                if action == "get":
                    item_id = str(kwargs.get("id", "")).strip()
                    item = store.get_item(item_id)
                    if item is None:
                        return self._err(f"Item {item_id!r} not found")
                    return self._ok(item.to_dict())

                if action == "update":
                    item_id = str(kwargs.get("id", "")).strip()
                    update_kwargs: Dict[str, Any] = {}
                    for field in ("title", "item_type", "due_date", "status", "needs_update", "notes"):
                        if field in kwargs:
                            update_kwargs[field] = kwargs[field]
                    item = store.update_item(item_id, **update_kwargs)
                    if item is None:
                        return self._err(f"Item {item_id!r} not found")
                    return self._ok(item.to_dict())

                if action == "delete":
                    item_id = str(kwargs.get("id", "")).strip()
                    if not store.delete_item(item_id):
                        return self._err(f"Item {item_id!r} not found")
                    return self._ok({"deleted": item_id})

                if action == "list":
                    items = store.list_items(
                        item_type=kwargs.get("item_type"),
                        status=kwargs.get("status"),
                        due_before=kwargs.get("due_before"),
                        due_after=kwargs.get("due_after"),
                        needs_update=kwargs.get("needs_update"),
                        query=kwargs.get("query"),
                        limit=int(kwargs.get("limit", 50)),
                    )
                    return self._ok([i.to_dict() for i in items])

                if action == "upcoming":
                    days = int(kwargs.get("within_days", 7))
                    items = store.upcoming_deadlines(within_days=days)
                    return self._ok([i.to_dict() for i in items])

                if action == "pending_updates":
                    items = store.pending_updates()
                    return self._ok([i.to_dict() for i in items])

                return self._err(f"Unknown item_store action: {action!r}")
        except Exception as exc:
            return self._err(str(exc))
