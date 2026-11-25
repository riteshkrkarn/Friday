"""Loader for organized Friday prompt templates in ``prompts/``."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

# Default repo-level prompts directory: <repo_root>/prompts
_DEFAULT_PROMPTS_DIR = Path(__file__).resolve().parents[3] / "prompts"


def get_prompts_dir() -> Path:
    """Return the active Friday prompts directory."""
    override = os.environ.get("FRIDAY_PROMPTS_DIR") or os.environ.get("OPENJARVIS_PROMPTS_DIR")
    if override:
        return Path(override)
    return _DEFAULT_PROMPTS_DIR


def load_prompt(name: str, *, fallback: str = "", **variables: Any) -> str:
    """Load ``prompts/<name>.md`` and format any ``{placeholders}``."""
    path = get_prompts_dir() / f"{name}.md"
    template = path.read_text(encoding="utf-8").strip() if path.exists() else fallback
    if not variables:
        return template
    return template.format(**variables)
