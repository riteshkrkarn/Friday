"""Windows double-tap hotkey listener for Second Me quick voice capture."""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Callable, Optional

from openjarvis.capture.quick_capture import CaptureResult, capture_audio
from openjarvis.speech.voice_io import record_until_silence
from openjarvis.tools.item_store import ItemStore

logger = logging.getLogger(__name__)


def _resolve_pynput_key(key_name: str, keyboard_mod: Any) -> Any:
    """Resolve a configurable key name (e.g. 'ctrl_r', 'shift_r', 'f9') to pynput Key."""
    normalized = key_name.strip().lower()
    if hasattr(keyboard_mod.Key, normalized):
        return getattr(keyboard_mod.Key, normalized)
    if len(normalized) == 1:
        return keyboard_mod.KeyCode.from_char(normalized)
    raise ValueError(f"Unknown hotkey name: {key_name!r}")


class DoubleTapDetector:
    """Pure state machine that detects two consecutive releases of a trigger key."""

    def __init__(
        self,
        trigger_key: Any = "ctrl_r",
        *,
        window_seconds: float = 0.4,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.trigger_key = trigger_key
        self.window_seconds = window_seconds
        self._clock = clock
        self._last_tap_time: Optional[float] = None

    def on_release(self, key: Any) -> bool:
        """Process a key release; return True when a clean double-tap is detected."""
        if key != self.trigger_key:
            self._last_tap_time = None
            return False

        now = self._clock()
        if (
            self._last_tap_time is not None
            and (now - self._last_tap_time) <= self.window_seconds
        ):
            self._last_tap_time = None
            return True

        self._last_tap_time = now
        return False


class HotkeyCaptureRunner:
    """Background Windows hotkey service that records and saves voice items."""

    def __init__(
        self,
        *,
        trigger_key: str = "ctrl_r",
        window_seconds: float = 0.4,
        preferred_backend: str = "auto",
        latency_threshold_s: float = 5.0,
        store: Optional[ItemStore] = None,
        engine: Any = None,
        model: Optional[str] = None,
        on_captured: Optional[Callable[[CaptureResult], None]] = None,
        on_error: Optional[Callable[[Exception], None]] = None,
    ) -> None:
        self.trigger_key_name = trigger_key
        self.window_seconds = window_seconds
        self.preferred_backend = preferred_backend
        self.latency_threshold_s = latency_threshold_s
        self._store = store
        self._engine = engine
        self._model = model
        self._on_captured = on_captured
        self._on_error = on_error
        self._busy_lock = threading.Lock()
        self._listener: Any = None

    def _capture_once(self) -> Optional[CaptureResult]:
        if not self._busy_lock.acquire(blocking=False):
            logger.debug("Ignoring hotkey trigger while previous capture is active")
            return None
        try:
            audio = record_until_silence()
            result = capture_audio(
                audio,
                preferred_backend=self.preferred_backend,
                latency_threshold_s=self.latency_threshold_s,
                store=self._store,
                engine=self._engine,
                model=self._model,
            )
            logger.info(
                "Captured [%s] %r via %s",
                result.item.item_type,
                result.item.title,
                result.transcription.backend_used if result.transcription else "unknown",
            )
            if self._on_captured is not None:
                self._on_captured(result)
            return result
        except Exception as exc:
            logger.warning("Quick voice capture failed: %s", exc)
            if self._on_error is not None:
                self._on_error(exc)
            return None
        finally:
            self._busy_lock.release()

    def start(self, *, blocking: bool = False) -> None:
        """Start listening for double-tap hotkey triggers."""
        try:
            from pynput import keyboard
        except ImportError as exc:
            raise RuntimeError(
                "pynput is required for hotkey capture. Install with: pip install pynput"
            ) from exc

        trigger = _resolve_pynput_key(self.trigger_key_name, keyboard)
        detector = DoubleTapDetector(trigger, window_seconds=self.window_seconds)

        def _on_release(key: Any) -> None:
            if detector.on_release(key):
                threading.Thread(target=self._capture_once, daemon=True).start()

        listener = keyboard.Listener(on_release=_on_release)
        self._listener = listener
        listener.start()
        if blocking:
            listener.join()

    def stop(self) -> None:
        """Stop the active keyboard listener if running."""
        if self._listener is not None:
            self._listener.stop()
            self._listener = None
