"""Repetition tracker and confirmation-gated rule routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from openjarvis.learning.repetition import DEFAULT_REPEAT_THRESHOLD, RepetitionStore

router = APIRouter(prefix="/v1/repetitions", tags=["repetitions"])


class TrackRepetitionRequest(BaseModel):
    action_key: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    weekday: Optional[str] = None
    suggested_schedule: str = ""
    threshold: int = DEFAULT_REPEAT_THRESHOLD


class DecideRuleRequest(BaseModel):
    decision: str = Field(..., description="accept, change, or reject")
    updated_prompt: Optional[str] = None
    updated_schedule: Optional[str] = None


def _open_store() -> RepetitionStore:
    return RepetitionStore()


@router.post("/track")
async def track_repetition(body: TrackRepetitionRequest):
    """Record a repeated user action and propose a rule once threshold is met."""
    try:
        with _open_store() as store:
            rule = store.record_event(
                body.action_key,
                body.label,
                weekday=body.weekday,
                suggested_schedule=body.suggested_schedule,
                threshold=body.threshold,
            )
            return {
                "recorded": True,
                "proposed_rule": rule.to_dict() if rule else None,
            }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/rules")
async def list_learned_rules(status: Optional[str] = Query(default=None)):
    """List proposed, accepted, or rejected rules."""
    try:
        with _open_store() as store:
            rules = store.list_rules(status=status)
            return {"rules": [r.to_dict() for r in rules], "count": len(rules)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/rules/{rule_id}/decide")
async def decide_learned_rule(rule_id: str, body: DecideRuleRequest):
    """Accept, change, or reject a proposed rule (required before acting)."""
    try:
        with _open_store() as store:
            rule = store.decide_rule(
                rule_id,
                body.decision,
                updated_prompt=body.updated_prompt,
                updated_schedule=body.updated_schedule,
            )
            if rule is None:
                raise HTTPException(status_code=404, detail=f"Rule {rule_id!r} not found")
            return rule.to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
