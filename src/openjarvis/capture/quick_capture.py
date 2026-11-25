"""Quick capture pipeline: speech-to-text, structured extraction, and ItemStore save."""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Dict, Optional

from openjarvis.core.types import Message, Role
from openjarvis.tools.item_store import ITEM_TYPES, Item, ItemStore

logger = logging.getLogger(__name__)

_ISO_DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")


@dataclass(slots=True)
class CaptureTranscription:
    """Result of transcribing captured audio."""

    text: str
    backend_used: str
    elapsed_seconds: float


@dataclass(slots=True)
class CaptureResult:
    """Result of capturing text or audio into ItemStore."""

    item: Item
    raw_text: str
    extractor_used: str
    transcription: Optional[CaptureTranscription] = None


def _default_whisper_backend() -> Any:
    from openjarvis.speech.faster_whisper import FasterWhisperBackend

    return FasterWhisperBackend()


def _default_deepgram_backend() -> Any:
    from openjarvis.speech.deepgram import DeepgramSpeechBackend

    return DeepgramSpeechBackend()


def transcribe_audio(
    audio: bytes,
    *,
    audio_format: str = "wav",
    language: Optional[str] = None,
    preferred_backend: str = "auto",
    latency_threshold_s: float = 5.0,
    whisper_backend: Any = None,
    deepgram_backend: Any = None,
) -> CaptureTranscription:
    """Transcribe audio trying local Whisper first, falling back to Deepgram.

    When ``preferred_backend`` is ``"deepgram"``, Deepgram is used directly.
    In ``"auto"`` or ``"whisper"`` mode, local Faster-Whisper runs first; if it
    errors or exceeds ``latency_threshold_s`` and Deepgram is healthy, Deepgram
    is used as the fallback.
    """
    pref = preferred_backend.strip().lower()

    if pref == "deepgram":
        dg = deepgram_backend or _default_deepgram_backend()
        t0 = time.monotonic()
        res = dg.transcribe(audio, format=audio_format, language=language)
        return CaptureTranscription(
            text=res.text.strip(),
            backend_used="deepgram",
            elapsed_seconds=time.monotonic() - t0,
        )

    whisper = whisper_backend or _default_whisper_backend()
    whisper_err: Optional[Exception] = None
    try:
        t0 = time.monotonic()
        res = whisper.transcribe(audio, format=audio_format, language=language)
        elapsed = time.monotonic() - t0
        text = res.text.strip()
        if elapsed <= latency_threshold_s or pref == "whisper":
            return CaptureTranscription(
                text=text,
                backend_used="faster-whisper",
                elapsed_seconds=elapsed,
            )
        logger.info(
            "Whisper took %.2fs (> %.2fs threshold); checking Deepgram fallback",
            elapsed,
            latency_threshold_s,
        )
        dg = deepgram_backend or _default_deepgram_backend()
        if dg.health():
            t1 = time.monotonic()
            dg_res = dg.transcribe(audio, format=audio_format, language=language)
            return CaptureTranscription(
                text=dg_res.text.strip(),
                backend_used="deepgram",
                elapsed_seconds=time.monotonic() - t1,
            )
        return CaptureTranscription(
            text=text,
            backend_used="faster-whisper",
            elapsed_seconds=elapsed,
        )
    except Exception as exc:
        whisper_err = exc
        if pref == "whisper":
            raise

    dg = deepgram_backend or _default_deepgram_backend()
    if dg.health():
        t1 = time.monotonic()
        dg_res = dg.transcribe(audio, format=audio_format, language=language)
        return CaptureTranscription(
            text=dg_res.text.strip(),
            backend_used="deepgram",
            elapsed_seconds=time.monotonic() - t1,
        )

    raise RuntimeError(f"Speech transcription failed: {whisper_err}") from whisper_err


def _heuristic_extract(text: str, *, today: Optional[date] = None) -> Dict[str, Any]:
    """Deterministic fallback extractor when no LLM engine is available."""
    ref_day = today or date.today()
    lower = text.lower()

    if "hackathon" in lower:
        item_type = "hackathon"
    elif any(kw in lower for kw in ("won ", "winner", "award", "achievement", "achieved", "prize")):
        item_type = "achievement"
    elif "project" in lower:
        item_type = "project"
    else:
        item_type = "task"

    due_date: Optional[str] = None
    iso_match = _ISO_DATE_RE.search(text)
    if iso_match:
        due_date = iso_match.group(1)
    elif "tomorrow" in lower:
        due_date = (ref_day + timedelta(days=1)).isoformat()
    elif "today" in lower:
        due_date = ref_day.isoformat()

    title = text.strip()
    if len(title) > 120:
        title = title[:117].rstrip() + "..."

    return {
        "title": title,
        "item_type": item_type,
        "due_date": due_date,
        "notes": "" if title == text.strip() else text.strip(),
    }


def _parse_json_object(raw: str) -> Optional[Dict[str, Any]]:
    stripped = raw.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", stripped, flags=re.DOTALL).strip()
    try:
        parsed = json.loads(stripped)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end > start:
            try:
                parsed = json.loads(stripped[start : end + 1])
                return parsed if isinstance(parsed, dict) else None
            except json.JSONDecodeError:
                return None
    return None


def extract_item_fields(
    text: str,
    *,
    engine: Any = None,
    model: Optional[str] = None,
    today: Optional[date] = None,
) -> tuple[Dict[str, Any], str]:
    """Extract structured ItemStore fields from natural-language text.

    Returns ``(fields_dict, extractor_used)``.
    """
    clean = text.strip()
    if not clean:
        raise ValueError("Capture text must not be empty")

    if engine is not None and model:
        ref_day = (today or date.today()).isoformat()
        prompt = (
            f"Today is {ref_day}. Extract a personal item from the user's note.\n"
            "Return ONLY a JSON object with keys:\n"
            '- "title": short concise title (string)\n'
            f'- "item_type": one of {list(ITEM_TYPES)}\n'
            '- "due_date": "YYYY-MM-DD" or null\n'
            '- "notes": extra details or ""\n\n'
            f"Note: {clean}"
        )
        try:
            resp = engine.generate(
                [Message(role=Role.USER, content=prompt)],
                model=model,
                temperature=0.1,
                max_tokens=256,
            )
            parsed = _parse_json_object(str(resp.get("content", "")))
            if parsed and str(parsed.get("title", "")).strip():
                raw_type = str(parsed.get("item_type", "task")).strip().lower()
                item_type = raw_type if raw_type in ITEM_TYPES else "task"
                due = parsed.get("due_date")
                due_str = str(due).strip() if isinstance(due, str) and due.strip() else None
                return (
                    {
                        "title": str(parsed["title"]).strip(),
                        "item_type": item_type,
                        "due_date": due_str,
                        "notes": str(parsed.get("notes") or "").strip(),
                    },
                    "llm",
                )
        except Exception as exc:
            logger.warning("LLM extraction failed; using heuristic fallback: %s", exc)

    return _heuristic_extract(clean, today=today), "heuristic"


def capture_text(
    text: str,
    *,
    store: Optional[ItemStore] = None,
    engine: Any = None,
    model: Optional[str] = None,
    today: Optional[date] = None,
) -> CaptureResult:
    """Extract item fields from text and persist to ItemStore."""
    fields, extractor = extract_item_fields(
        text,
        engine=engine,
        model=model,
        today=today,
    )
    owns_store = store is None
    target_store = store or ItemStore()
    try:
        item = target_store.add_item(
            title=fields["title"],
            item_type=fields["item_type"],
            due_date=fields.get("due_date"),
            notes=fields.get("notes", ""),
        )
        return CaptureResult(item=item, raw_text=text.strip(), extractor_used=extractor)
    finally:
        if owns_store:
            target_store.close()


def capture_audio(
    audio: bytes,
    *,
    audio_format: str = "wav",
    language: Optional[str] = None,
    preferred_backend: str = "auto",
    latency_threshold_s: float = 5.0,
    whisper_backend: Any = None,
    deepgram_backend: Any = None,
    store: Optional[ItemStore] = None,
    engine: Any = None,
    model: Optional[str] = None,
    today: Optional[date] = None,
) -> CaptureResult:
    """Transcribe audio and save the extracted item into ItemStore."""
    transcription = transcribe_audio(
        audio,
        audio_format=audio_format,
        language=language,
        preferred_backend=preferred_backend,
        latency_threshold_s=latency_threshold_s,
        whisper_backend=whisper_backend,
        deepgram_backend=deepgram_backend,
    )
    if not transcription.text:
        raise ValueError("No speech detected in captured audio")
    result = capture_text(
        transcription.text,
        store=store,
        engine=engine,
        model=model,
        today=today,
    )
    result.transcription = transcription
    return result
