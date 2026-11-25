"""Item routes — CRUD and search endpoints for Second Me personal items."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from openjarvis.tools.item_store import ItemStore

router = APIRouter(prefix="/v1/items", tags=["items"])


class CreateItemRequest(BaseModel):
    title: str = Field(..., min_length=1)
    item_type: str = Field(..., description="hackathon, project, task, or achievement")
    due_date: Optional[str] = None
    status: str = "open"
    needs_update: Optional[bool] = None
    notes: str = ""


class UpdateItemRequest(BaseModel):
    title: Optional[str] = None
    item_type: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    needs_update: Optional[bool] = None
    notes: Optional[str] = None


class CaptureTextRequest(BaseModel):
    text: str = Field(..., min_length=1)


def _open_store() -> ItemStore:
    return ItemStore()


@router.get("")
async def list_items(
    item_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    due_before: Optional[str] = Query(default=None),
    due_after: Optional[str] = Query(default=None),
    needs_update: Optional[bool] = Query(default=None),
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
):
    """List and filter personal items."""
    try:
        with _open_store() as store:
            items = store.list_items(
                item_type=item_type,
                status=status,
                due_before=due_before,
                due_after=due_after,
                needs_update=needs_update,
                query=q,
                limit=limit,
            )
            return {"items": [i.to_dict() for i in items], "count": len(items)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("", status_code=201)
async def create_item(body: CreateItemRequest):
    """Create a new personal item."""
    try:
        with _open_store() as store:
            item = store.add_item(
                title=body.title,
                item_type=body.item_type,
                due_date=body.due_date,
                status=body.status,
                needs_update=body.needs_update,
                notes=body.notes,
            )
            return item.to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/upcoming")
async def upcoming_items(within_days: int = Query(default=7, ge=0, le=365)):
    """Return open/in-progress items with deadlines in the next N days."""
    with _open_store() as store:
        items = store.upcoming_deadlines(within_days=within_days)
        return {"items": [i.to_dict() for i in items], "count": len(items)}


@router.get("/pending-updates")
async def pending_update_items():
    """Return items flagged as needing a resume or portfolio update."""
    with _open_store() as store:
        items = store.pending_updates()
        return {"items": [i.to_dict() for i in items], "count": len(items)}


@router.get("/{item_id}")
async def get_item(item_id: str):
    """Fetch a single item by ID."""
    with _open_store() as store:
        item = store.get_item(item_id)
        if item is None:
            raise HTTPException(status_code=404, detail=f"Item {item_id!r} not found")
        return item.to_dict()


@router.patch("/{item_id}")
async def update_item(item_id: str, body: UpdateItemRequest):
    """Update fields on an existing item."""
    updates = body.model_dump(exclude_unset=True)
    try:
        with _open_store() as store:
            item = store.update_item(item_id, **updates)
            if item is None:
                raise HTTPException(status_code=404, detail=f"Item {item_id!r} not found")
            return item.to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{item_id}")
async def delete_item(item_id: str):
    """Delete an item by ID."""
    with _open_store() as store:
        if not store.delete_item(item_id):
            raise HTTPException(status_code=404, detail=f"Item {item_id!r} not found")
        return {"deleted": item_id}


@router.post("/capture", status_code=201)
async def capture_item_text(body: CaptureTextRequest):
    """Extract structured fields from natural-language text and save to ItemStore."""
    from openjarvis.capture.quick_capture import capture_text

    try:
        with _open_store() as store:
            res = capture_text(body.text, store=store)
            return {
                "item": res.item.to_dict(),
                "raw_text": res.raw_text,
                "extractor_used": res.extractor_used,
            }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
