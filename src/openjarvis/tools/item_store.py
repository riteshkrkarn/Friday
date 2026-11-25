"""ItemStore — SQLite-backed store for Second Me personal items.

Tracks hackathons, projects, tasks, and achievements with deadlines,
status, notes, and resume/portfolio update flags.
"""

from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from openjarvis.core.paths import get_config_dir

ITEM_TYPES = ("hackathon", "project", "task", "achievement")
ITEM_STATUSES = ("open", "in_progress", "done", "archived")

_UNSET: Any = object()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _validate_choice(value: str, allowed: tuple[str, ...], label: str) -> str:
    normalized = value.strip().lower()
    if normalized not in allowed:
        raise ValueError(
            f"Invalid {label} {value!r}; expected one of {', '.join(allowed)}"
        )
    return normalized


@dataclass
class Item:
    """A tracked Second Me item (hackathon, project, task, or achievement)."""

    id: str
    title: str
    item_type: str
    due_date: Optional[str] = None
    status: str = "open"
    needs_update: bool = False
    notes: str = ""
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "item_type": self.item_type,
            "due_date": self.due_date,
            "status": self.status,
            "needs_update": self.needs_update,
            "notes": self.notes,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_row(cls, row: tuple) -> Item:
        (
            id_,
            title,
            item_type,
            due_date,
            status,
            needs_update,
            notes,
            created_at,
            updated_at,
        ) = row
        return cls(
            id=id_,
            title=title,
            item_type=item_type,
            due_date=due_date,
            status=status,
            needs_update=bool(needs_update),
            notes=notes or "",
            created_at=created_at or "",
            updated_at=updated_at or "",
        )


class ItemStore:
    """SQLite store for Second Me hackathons, projects, tasks, and achievements."""

    def __init__(self, db_path: str = "") -> None:
        if not db_path:
            db_path = str(get_config_dir() / "items.db")
        self._db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._create_tables()
        self._conn.commit()

    def _create_tables(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                item_type TEXT NOT NULL,
                due_date TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                needs_update INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_type ON items(item_type)"
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_status ON items(status)"
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_items_due_date ON items(due_date)"
        )

    def add_item(
        self,
        title: str,
        item_type: str,
        *,
        due_date: Optional[str] = None,
        status: str = "open",
        needs_update: Optional[bool] = None,
        notes: str = "",
    ) -> Item:
        clean_title = title.strip()
        if not clean_title:
            raise ValueError("Item title must not be empty")
        norm_type = _validate_choice(item_type, ITEM_TYPES, "item_type")
        norm_status = _validate_choice(status, ITEM_STATUSES, "status")
        if needs_update is None:
            # Achievements and completed projects default to needing a resume/portfolio update.
            needs_update = norm_type == "achievement" or (
                norm_type == "project" and norm_status == "done"
            )
        now = _utc_now_iso()
        item = Item(
            id=uuid.uuid4().hex[:12],
            title=clean_title,
            item_type=norm_type,
            due_date=due_date.strip() if isinstance(due_date, str) and due_date.strip() else None,
            status=norm_status,
            needs_update=bool(needs_update),
            notes=notes.strip() if notes else "",
            created_at=now,
            updated_at=now,
        )
        self._conn.execute(
            """
            INSERT INTO items
                (id, title, item_type, due_date, status, needs_update, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item.id,
                item.title,
                item.item_type,
                item.due_date,
                item.status,
                int(item.needs_update),
                item.notes,
                item.created_at,
                item.updated_at,
            ),
        )
        self._conn.commit()
        return item

    def get_item(self, item_id: str) -> Optional[Item]:
        cur = self._conn.execute(
            """
            SELECT id, title, item_type, due_date, status, needs_update, notes, created_at, updated_at
            FROM items
            WHERE id = ?
            """,
            (item_id,),
        )
        row = cur.fetchone()
        return Item.from_row(row) if row else None

    def update_item(
        self,
        item_id: str,
        *,
        title: Any = _UNSET,
        item_type: Any = _UNSET,
        due_date: Any = _UNSET,
        status: Any = _UNSET,
        needs_update: Any = _UNSET,
        notes: Any = _UNSET,
    ) -> Optional[Item]:
        existing = self.get_item(item_id)
        if existing is None:
            return None

        new_title = existing.title
        if title is not _UNSET:
            clean_title = str(title).strip()
            if not clean_title:
                raise ValueError("Item title must not be empty")
            new_title = clean_title

        new_type = (
            _validate_choice(str(item_type), ITEM_TYPES, "item_type")
            if item_type is not _UNSET
            else existing.item_type
        )
        new_status = (
            _validate_choice(str(status), ITEM_STATUSES, "status")
            if status is not _UNSET
            else existing.status
        )
        if due_date is _UNSET:
            new_due = existing.due_date
        elif due_date is None:
            new_due = None
        else:
            stripped = str(due_date).strip()
            new_due = stripped if stripped else None

        if needs_update is _UNSET:
            # Automatically flag projects newly marked done unless already cleared.
            if (
                new_type in ("project", "achievement")
                and new_status == "done"
                and existing.status != "done"
            ):
                new_needs_update = True
            else:
                new_needs_update = existing.needs_update
        else:
            new_needs_update = bool(needs_update)

        new_notes = existing.notes if notes is _UNSET else (str(notes).strip() if notes else "")
        now = _utc_now_iso()

        self._conn.execute(
            """
            UPDATE items
            SET title = ?, item_type = ?, due_date = ?, status = ?,
                needs_update = ?, notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                new_title,
                new_type,
                new_due,
                new_status,
                int(new_needs_update),
                new_notes,
                now,
                item_id,
            ),
        )
        self._conn.commit()
        return self.get_item(item_id)

    def delete_item(self, item_id: str) -> bool:
        cur = self._conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        self._conn.commit()
        return cur.rowcount > 0

    def list_items(
        self,
        *,
        item_type: Optional[str] = None,
        status: Optional[str] = None,
        due_before: Optional[str] = None,
        due_after: Optional[str] = None,
        needs_update: Optional[bool] = None,
        query: Optional[str] = None,
        limit: int = 100,
    ) -> List[Item]:
        clauses: List[str] = []
        params: List[Any] = []

        if item_type is not None:
            clauses.append("item_type = ?")
            params.append(_validate_choice(item_type, ITEM_TYPES, "item_type"))
        if status is not None:
            clauses.append("status = ?")
            params.append(_validate_choice(status, ITEM_STATUSES, "status"))
        if due_before is not None:
            clauses.append("due_date IS NOT NULL AND due_date <= ?")
            params.append(due_before)
        if due_after is not None:
            clauses.append("due_date IS NOT NULL AND due_date >= ?")
            params.append(due_after)
        if needs_update is not None:
            clauses.append("needs_update = ?")
            params.append(int(bool(needs_update)))
        if query:
            pattern = f"%{query.strip()}%"
            clauses.append("(title LIKE ? COLLATE NOCASE OR notes LIKE ? COLLATE NOCASE)")
            params.extend([pattern, pattern])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        sql = f"""
            SELECT id, title, item_type, due_date, status, needs_update, notes, created_at, updated_at
            FROM items
            {where_sql}
            ORDER BY (due_date IS NULL) ASC, due_date ASC, created_at DESC
            LIMIT ?
        """
        params.append(max(1, min(int(limit), 1000)))
        cur = self._conn.execute(sql, params)
        return [Item.from_row(row) for row in cur.fetchall()]

    def upcoming_deadlines(
        self,
        *,
        within_days: int = 7,
        from_date: Optional[date] = None,
    ) -> List[Item]:
        start = from_date or date.today()
        end = start + timedelta(days=max(0, within_days))
        cur = self._conn.execute(
            """
            SELECT id, title, item_type, due_date, status, needs_update, notes, created_at, updated_at
            FROM items
            WHERE status NOT IN ('done', 'archived')
              AND due_date IS NOT NULL
              AND substr(due_date, 1, 10) >= ?
              AND substr(due_date, 1, 10) <= ?
            ORDER BY due_date ASC, created_at DESC
            """,
            (start.isoformat(), end.isoformat()),
        )
        return [Item.from_row(row) for row in cur.fetchall()]

    def pending_updates(self) -> List[Item]:
        """Return items flagged as needing a resume/portfolio update."""
        cur = self._conn.execute(
            """
            SELECT id, title, item_type, due_date, status, needs_update, notes, created_at, updated_at
            FROM items
            WHERE needs_update = 1
              AND status != 'archived'
            ORDER BY updated_at DESC
            """
        )
        return [Item.from_row(row) for row in cur.fetchall()]

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> ItemStore:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
