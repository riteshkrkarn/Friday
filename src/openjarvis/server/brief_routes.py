"""Morning brief and report preference routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from openjarvis.reports.morning_brief import (
    BriefPreferencesStore,
    generate_morning_brief,
)
from openjarvis.tools.item_store import ItemStore

router = APIRouter(prefix="/v1/brief", tags=["brief"])


class UpdateBriefPreferencesRequest(BaseModel):
    include: Optional[str] = None
    exclude: Optional[str] = None
    instruction: Optional[str] = None


def _open_item_store() -> ItemStore:
    return ItemStore()


def _open_prefs_store() -> BriefPreferencesStore:
    return BriefPreferencesStore()


@router.get("")
async def get_morning_brief():
    """Generate today's personalized morning brief using saved items & preferences."""
    with _open_item_store() as store, _open_prefs_store() as prefs_store:
        brief = generate_morning_brief(store, prefs_store)
        return {
            "date": brief.date,
            "text": brief.text,
            "synthesized_by": brief.synthesized_by,
            "sections": {
                k: [i.to_dict() for i in v] for k, v in brief.sections.items()
            },
            "preferences": brief.preferences.to_dict(),
        }


@router.get("/preferences")
async def get_brief_preferences():
    """Get remembered morning brief include/exclude preferences."""
    with _open_prefs_store() as prefs_store:
        return prefs_store.get_preferences().to_dict()


@router.post("/preferences")
async def update_brief_preferences(body: UpdateBriefPreferencesRequest):
    """Update and persist morning brief include/exclude preferences."""
    try:
        with _open_prefs_store() as prefs_store:
            prefs = prefs_store.get_preferences()
            if body.include:
                prefs = prefs_store.include_section(body.include)
            if body.exclude:
                prefs = prefs_store.exclude_section(body.exclude)
            if body.instruction:
                prefs = prefs_store.apply_instruction(body.instruction)
            return prefs.to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
