"""Repetition tracker — detects repeated habits and proposes confirmation-gated rules."""

from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from openjarvis.core.friday_prompts import load_prompt
from openjarvis.core.paths import get_config_dir

DEFAULT_REPEAT_THRESHOLD = 3
RULE_STATUSES = ("proposed", "accepted", "rejected")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(slots=True)
class ProposedRule:
    """A rule or shortcut proposed after repeated user behavior."""

    id: str
    action_key: str
    label: str
    proposal_text: str
    suggested_schedule: str = ""
    count: int = 0
    status: str = "proposed"  # proposed | accepted | rejected
    confirmed: bool = False
    created_at: str = ""
    decided_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "action_key": self.action_key,
            "label": self.label,
            "proposal_text": self.proposal_text,
            "suggested_schedule": self.suggested_schedule,
            "count": self.count,
            "status": self.status,
            "confirmed": self.confirmed,
            "created_at": self.created_at,
            "decided_at": self.decided_at,
        }

    @classmethod
    def from_row(cls, row: tuple) -> ProposedRule:
        (
            id_,
            action_key,
            label,
            proposal_text,
            suggested_schedule,
            count,
            status,
            confirmed,
            created_at,
            decided_at,
        ) = row
        return cls(
            id=id_,
            action_key=action_key,
            label=label,
            proposal_text=proposal_text,
            suggested_schedule=suggested_schedule or "",
            count=int(count),
            status=status,
            confirmed=bool(confirmed),
            created_at=created_at or "",
            decided_at=decided_at,
        )


class RepetitionStore:
    """SQLite store for tracking repeated actions and confirmation-gated rules."""

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
            CREATE TABLE IF NOT EXISTS repetition_events (
                action_key TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                last_seen TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT '{}'
            )
            """
        )
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS learned_rules (
                id TEXT PRIMARY KEY,
                action_key TEXT NOT NULL,
                label TEXT NOT NULL,
                proposal_text TEXT NOT NULL,
                suggested_schedule TEXT NOT NULL DEFAULT '',
                count INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'proposed',
                confirmed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                decided_at TEXT
            )
            """
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_learned_rules_key ON learned_rules(action_key)"
        )
        self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_learned_rules_status ON learned_rules(status)"
        )

    def record_event(
        self,
        action_key: str,
        label: str,
        *,
        weekday: Optional[str] = None,
        suggested_schedule: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        threshold: int = DEFAULT_REPEAT_THRESHOLD,
    ) -> Optional[ProposedRule]:
        """Record a user action; return a newly proposed rule once threshold is met.

        Never activates or executes a rule without explicit user confirmation.
        """
        key = action_key.strip().lower()
        clean_label = label.strip()
        if not key or not clean_label:
            raise ValueError("action_key and label must not be empty")

        now = _utc_now_iso()
        meta_json = json.dumps(metadata or {})
        self._conn.execute(
            """
            INSERT INTO repetition_events (action_key, label, count, last_seen, metadata)
            VALUES (?, ?, 1, ?, ?)
            ON CONFLICT(action_key) DO UPDATE SET
                label = excluded.label,
                count = repetition_events.count + 1,
                last_seen = excluded.last_seen,
                metadata = excluded.metadata
            """,
            (key, clean_label, now, meta_json),
        )
        self._conn.commit()

        cur = self._conn.execute(
            "SELECT count FROM repetition_events WHERE action_key = ?",
            (key,),
        )
        count = int(cur.fetchone()[0])

        if count < max(1, threshold):
            return None

        # Do not duplicate if a rule already exists for this action_key
        existing = self._conn.execute(
            "SELECT id FROM learned_rules WHERE action_key = ? LIMIT 1",
            (key,),
        ).fetchone()
        if existing is not None:
            return None

        when = f" on {weekday}" if weekday else ""
        proposal = load_prompt(
            "repetition_proposal",
            fallback=(
                "You often {label}{when} ({count} times). "
                "Want to set up a reminder or shortcut for this?"
            ),
            label=clean_label,
            when=when,
            count=count,
        )
        rule = ProposedRule(
            id=uuid.uuid4().hex[:12],
            action_key=key,
            label=clean_label,
            proposal_text=proposal,
            suggested_schedule=suggested_schedule,
            count=count,
            status="proposed",
            confirmed=False,
            created_at=now,
            decided_at=None,
        )
        self._conn.execute(
            """
            INSERT INTO learned_rules
                (id, action_key, label, proposal_text, suggested_schedule, count,
                 status, confirmed, created_at, decided_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rule.id,
                rule.action_key,
                rule.label,
                rule.proposal_text,
                rule.suggested_schedule,
                rule.count,
                rule.status,
                int(rule.confirmed),
                rule.created_at,
                rule.decided_at,
            ),
        )
        self._conn.commit()
        return rule

    def get_rule(self, rule_id: str) -> Optional[ProposedRule]:
        cur = self._conn.execute(
            """
            SELECT id, action_key, label, proposal_text, suggested_schedule,
                   count, status, confirmed, created_at, decided_at
            FROM learned_rules
            WHERE id = ?
            """,
            (rule_id,),
        )
        row = cur.fetchone()
        return ProposedRule.from_row(row) if row else None

    def list_rules(self, *, status: Optional[str] = None) -> List[ProposedRule]:
        if status is not None:
            norm = status.strip().lower()
            if norm not in RULE_STATUSES:
                raise ValueError(
                    f"Invalid status {status!r}; expected one of {', '.join(RULE_STATUSES)}"
                )
            cur = self._conn.execute(
                """
                SELECT id, action_key, label, proposal_text, suggested_schedule,
                       count, status, confirmed, created_at, decided_at
                FROM learned_rules
                WHERE status = ?
                ORDER BY created_at DESC
                """,
                (norm,),
            )
        else:
            cur = self._conn.execute(
                """
                SELECT id, action_key, label, proposal_text, suggested_schedule,
                       count, status, confirmed, created_at, decided_at
                FROM learned_rules
                ORDER BY created_at DESC
                """
            )
        return [ProposedRule.from_row(row) for row in cur.fetchall()]

    def decide_rule(
        self,
        rule_id: str,
        decision: str,
        *,
        updated_prompt: Optional[str] = None,
        updated_schedule: Optional[str] = None,
    ) -> Optional[ProposedRule]:
        """Apply user confirmation: accept, change (edit+accept), or reject."""
        existing = self.get_rule(rule_id)
        if existing is None:
            return None

        dec = decision.strip().lower()
        if dec not in ("accept", "change", "reject"):
            raise ValueError(
                f"Invalid decision {decision!r}; expected 'accept', 'change', or 'reject'"
            )

        now = _utc_now_iso()
        if dec == "reject":
            new_status = "rejected"
            confirmed = False
            new_prompt = existing.proposal_text
            new_schedule = existing.suggested_schedule
        else:
            new_status = "accepted"
            confirmed = True
            new_prompt = (
                updated_prompt.strip()
                if updated_prompt and updated_prompt.strip()
                else existing.proposal_text
            )
            new_schedule = (
                updated_schedule.strip()
                if updated_schedule is not None
                else existing.suggested_schedule
            )

        self._conn.execute(
            """
            UPDATE learned_rules
            SET proposal_text = ?, suggested_schedule = ?, status = ?,
                confirmed = ?, decided_at = ?
            WHERE id = ?
            """,
            (new_prompt, new_schedule, new_status, int(confirmed), now, rule_id),
        )
        self._conn.commit()
        return self.get_rule(rule_id)

    def can_execute_rule(self, rule_id: str) -> bool:
        """Return True only when the user has explicitly accepted/confirmed the rule."""
        rule = self.get_rule(rule_id)
        return rule is not None and rule.status == "accepted" and rule.confirmed

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> RepetitionStore:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()
