"""Personalized Morning Brief backed by ItemStore and remembered preferences."""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from openjarvis.core.friday_prompts import load_prompt
from openjarvis.core.paths import get_config_dir
from openjarvis.core.types import Message, Role
from openjarvis.tools.item_store import Item, ItemStore

logger = logging.getLogger(__name__)

DEFAULT_BRIEF_SECTIONS = [
    "deadlines_today",
    "pending_updates",
    "open_tasks",
]

ALL_BRIEF_SECTIONS = (
    "deadlines_today",
    "upcoming_deadlines",
    "pending_updates",
    "open_tasks",
    "hackathons",
    "projects",
    "achievements",
)

_SECTION_ALIASES: Dict[str, str] = {
    "deadline": "deadlines_today",
    "deadlines": "deadlines_today",
    "today": "deadlines_today",
    "today's deadlines": "deadlines_today",
    "deadlines_today": "deadlines_today",
    "upcoming": "upcoming_deadlines",
    "upcoming deadlines": "upcoming_deadlines",
    "upcoming_deadlines": "upcoming_deadlines",
    "updates": "pending_updates",
    "pending updates": "pending_updates",
    "pending_updates": "pending_updates",
    "resume": "pending_updates",
    "portfolio": "pending_updates",
    "task": "open_tasks",
    "tasks": "open_tasks",
    "open tasks": "open_tasks",
    "open_tasks": "open_tasks",
    "hackathon": "hackathons",
    "hackathons": "hackathons",
    "project": "projects",
    "projects": "projects",
    "achievement": "achievements",
    "achievements": "achievements",
}

_SECTION_LABELS: Dict[str, str] = {
    "deadlines_today": "Today's & Overdue Deadlines",
    "upcoming_deadlines": "Upcoming Deadlines (Next 7 Days)",
    "pending_updates": "Pending Resume / Portfolio Updates",
    "open_tasks": "Open Tasks",
    "hackathons": "Active Hackathons",
    "projects": "Active Projects",
    "achievements": "Achievements",
}


def normalize_section_name(raw: str) -> str:
    key = raw.strip().lower().replace("-", "_")
    if key in _SECTION_ALIASES:
        return _SECTION_ALIASES[key]
    if key in ALL_BRIEF_SECTIONS:
        return key
    raise ValueError(
        f"Unknown brief section {raw!r}; expected one of {', '.join(ALL_BRIEF_SECTIONS)}"
    )


@dataclass(slots=True)
class BriefPreferences:
    """Persisted section preferences for personalized reports."""

    included_sections: List[str] = field(
        default_factory=lambda: list(DEFAULT_BRIEF_SECTIONS)
    )
    excluded_sections: List[str] = field(default_factory=list)
    updated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "included_sections": list(self.included_sections),
            "excluded_sections": list(self.excluded_sections),
            "updated_at": self.updated_at,
        }


@dataclass(slots=True)
class MorningBrief:
    """Generated personalized morning brief."""

    date: str
    sections: Dict[str, List[Item]]
    text: str
    preferences: BriefPreferences
    synthesized_by: str = "template"


class BriefPreferencesStore:
    """SQLite store for user report include/exclude preferences."""

    def __init__(self, db_path: str = "") -> None:
        if not db_path:
            db_path = str(get_config_dir() / "items.db")
        self._db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS report_preferences (
                id TEXT PRIMARY KEY,
                included_sections TEXT NOT NULL,
                excluded_sections TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    def get_preferences(self) -> BriefPreferences:
        cur = self._conn.execute(
            """
            SELECT included_sections, excluded_sections, updated_at
            FROM report_preferences
            WHERE id = 'default'
            """
        )
        row = cur.fetchone()
        if row is None:
            return BriefPreferences()
        return BriefPreferences(
            included_sections=json.loads(row[0]),
            excluded_sections=json.loads(row[1]),
            updated_at=row[2] or "",
        )

    def _save(self, prefs: BriefPreferences) -> BriefPreferences:
        now = datetime.now(timezone.utc).isoformat()
        prefs.updated_at = now
        self._conn.execute(
            """
            INSERT INTO report_preferences (id, included_sections, excluded_sections, updated_at)
            VALUES ('default', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                included_sections = excluded.included_sections,
                excluded_sections = excluded.excluded_sections,
                updated_at = excluded.updated_at
            """,
            (
                json.dumps(prefs.included_sections),
                json.dumps(prefs.excluded_sections),
                now,
            ),
        )
        self._conn.commit()
        return prefs

    def include_section(self, section: str) -> BriefPreferences:
        canonical = normalize_section_name(section)
        prefs = self.get_preferences()
        if canonical in prefs.excluded_sections:
            prefs.excluded_sections.remove(canonical)
        if canonical not in prefs.included_sections:
            prefs.included_sections.append(canonical)
        return self._save(prefs)

    def exclude_section(self, section: str) -> BriefPreferences:
        canonical = normalize_section_name(section)
        prefs = self.get_preferences()
        if canonical in prefs.included_sections:
            prefs.included_sections.remove(canonical)
        if canonical not in prefs.excluded_sections:
            prefs.excluded_sections.append(canonical)
        return self._save(prefs)

    def apply_instruction(self, instruction: str) -> BriefPreferences:
        """Parse natural-language include/exclude instructions and persist them."""
        lower = instruction.strip().lower()
        if not lower:
            raise ValueError("Instruction must not be empty")

        is_exclude = any(
            kw in lower for kw in ("remove", "exclude", "hide", "drop", "skip", "without")
        )
        is_include = any(
            kw in lower for kw in ("include", "add", "show", "keep", "with")
        )

        matched: List[str] = []
        for alias, canonical in _SECTION_ALIASES.items():
            if alias in lower and canonical not in matched:
                matched.append(canonical)

        if not matched:
            raise ValueError(
                f"Could not identify a brief section in {instruction!r}"
            )

        prefs = self.get_preferences()
        for sec in matched:
            if is_exclude and not is_include:
                prefs = self.exclude_section(sec)
            else:
                prefs = self.include_section(sec)
        return prefs

    def close(self) -> None:
        self._conn.close()

    def __enter__(self) -> BriefPreferencesStore:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


def _collect_section_items(
    store: ItemStore,
    section: str,
    ref_day: date,
) -> List[Item]:
    today_iso = ref_day.isoformat()
    if section == "deadlines_today":
        active = [
            i
            for i in store.list_items(limit=500)
            if i.status not in ("done", "archived") and i.due_date
        ]
        return [i for i in active if i.due_date[:10] <= today_iso]
    if section == "upcoming_deadlines":
        return store.upcoming_deadlines(within_days=7, from_date=ref_day)
    if section == "pending_updates":
        return store.pending_updates()
    if section == "open_tasks":
        return [
            i
            for i in store.list_items(item_type="task", limit=200)
            if i.status in ("open", "in_progress")
        ]
    if section == "hackathons":
        return [
            i
            for i in store.list_items(item_type="hackathon", limit=200)
            if i.status != "archived"
        ]
    if section == "projects":
        return [
            i
            for i in store.list_items(item_type="project", limit=200)
            if i.status != "archived"
        ]
    if section == "achievements":
        return [
            i
            for i in store.list_items(item_type="achievement", limit=200)
            if i.status != "archived"
        ]
    return []


def _format_template_brief(
    ref_day: date,
    sections: Dict[str, List[Item]],
) -> str:
    lines = [f"Morning Brief — {ref_day.strftime('%A, %b %d, %Y')}", ""]
    any_items = False
    for sec, items in sections.items():
        if not items:
            continue
        any_items = True
        lines.append(f"{_SECTION_LABELS.get(sec, sec)}:")
        for item in items:
            due = f" (due {item.due_date})" if item.due_date else ""
            lines.append(f"- [{item.item_type}] {item.title}{due}")
        lines.append("")
    if not any_items:
        lines.append("All clear today — no deadlines, pending updates, or open tasks.")
    return "\n".join(lines).strip()


def generate_morning_brief(
    store: ItemStore,
    prefs_store: BriefPreferencesStore,
    *,
    engine: Any = None,
    model: Optional[str] = None,
    today: Optional[date] = None,
) -> MorningBrief:
    """Build a personalized morning brief using saved items and preferences."""
    ref_day = today or date.today()
    prefs = prefs_store.get_preferences()

    active_sections = [
        sec for sec in prefs.included_sections if sec not in prefs.excluded_sections
    ]
    collected: Dict[str, List[Item]] = {
        sec: _collect_section_items(store, sec, ref_day) for sec in active_sections
    }

    template_text = _format_template_brief(ref_day, collected)
    synthesized_by = "template"
    final_text = template_text

    if engine is not None and model:
        prompt = load_prompt(
            "morning_brief",
            fallback=(
                "Write a concise, personalized morning briefing for Friday using ONLY "
                "the data below. Keep the exact section priority order. Do not invent items.\n\n"
                "{template_text}"
            ),
            template_text=template_text,
        )
        try:
            resp = engine.generate(
                [Message(role=Role.USER, content=prompt)],
                model=model,
                temperature=0.2,
                max_tokens=300,
            )
            llm_text = str(resp.get("content", "")).strip()
            if llm_text:
                final_text = llm_text
                synthesized_by = "llm"
        except Exception as exc:
            logger.warning("Morning brief LLM synthesis failed; using template: %s", exc)

    return MorningBrief(
        date=ref_day.isoformat(),
        sections=collected,
        text=final_text,
        preferences=prefs,
        synthesized_by=synthesized_by,
    )
