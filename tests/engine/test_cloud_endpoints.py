"""Integration tests to verify Groq and NVIDIA NIM API keys, model availability, and live inference."""

from __future__ import annotations

import os
from pathlib import Path
import httpx
import pytest

def _load_env_keys() -> dict[str, str]:
    """Read keys from .env or environment."""
    keys: dict[str, str] = {}
    env_file = Path(".env")
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                keys[k.strip()] = v.strip().strip("'\"")
    for k in ("GROQ_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY"):
        val = os.environ.get(k)
        if val:
            keys[k] = val
    return keys

_KEYS = _load_env_keys()
_GROQ_KEY = _KEYS.get("GROQ_API_KEY")
_NIM_KEY = _KEYS.get("NIM_API_KEY") or _KEYS.get("NVIDIA_API_KEY")


@pytest.mark.skipif(not _GROQ_KEY, reason="GROQ_API_KEY not found in .env or environment")
class TestGroqEndpoint:
    """Test suite validating Groq connectivity, key validity, catalog, and inference."""

    def test_groq_api_key_validity(self):
        """Verify that GROQ_API_KEY is accepted by the Groq API."""
        headers = {"Authorization": f"Bearer {_GROQ_KEY}"}
        resp = httpx.get("https://api.groq.com/openai/v1/models", headers=headers, timeout=10.0)
        assert resp.status_code == 200, f"Groq authentication failed: {resp.status_code} {resp.text}"

    def test_groq_models_available(self):
        """Verify that expected active models are listed in the Groq catalog."""
        headers = {"Authorization": f"Bearer {_GROQ_KEY}"}
        resp = httpx.get("https://api.groq.com/openai/v1/models", headers=headers, timeout=10.0)
        assert resp.status_code == 200
        data = resp.json().get("data", [])
        active_ids = {m["id"] for m in data if m.get("active", True)}
        
        # Verify that key reasoning & fast models are present
        expected_candidates = {"openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "allam-2-7b"}
        overlap = expected_candidates.intersection(active_ids)
        assert len(overlap) > 0, f"None of the expected models found in Groq catalog: {active_ids}"

    @pytest.mark.parametrize(
        "model",
        [
            "openai/gpt-oss-20b",
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
        ],
    )
    def test_groq_chat_completion(self, model):
        """Verify live chat completion works and returns non-empty response."""
        headers = {
            "Authorization": f"Bearer {_GROQ_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "Respond with the word 'PONG'."}],
            "max_tokens": 50,
            "temperature": 0.1,
        }
        resp = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=20.0,
        )
        assert resp.status_code == 200, f"Inference failed for {model}: {resp.status_code} {resp.text}"
        data = resp.json()
        assert "choices" in data and len(data["choices"]) > 0
        message = data["choices"][0]["message"]
        content = message.get("content") or message.get("reasoning_content") or ""
        assert len(content.strip()) > 0, f"Received empty completion from {model}"


@pytest.mark.skipif(not _NIM_KEY, reason="NIM_API_KEY/NVIDIA_API_KEY not found in .env or environment")
class TestNIMEndpoint:
    """Test suite validating NVIDIA NIM connectivity, key validity, catalog, and inference."""

    def test_nim_api_key_validity(self):
        """Verify that NIM_API_KEY is accepted by the NVIDIA NIM DGX cloud API."""
        headers = {"Authorization": f"Bearer {_NIM_KEY}"}
        resp = httpx.get("https://integrate.api.nvidia.com/v1/models", headers=headers, timeout=10.0)
        assert resp.status_code == 200, f"NVIDIA NIM authentication failed: {resp.status_code} {resp.text}"

    def test_nim_models_available(self):
        """Verify that expected active Nemotron & chat models are listed in the NIM catalog."""
        headers = {"Authorization": f"Bearer {_NIM_KEY}"}
        resp = httpx.get("https://integrate.api.nvidia.com/v1/models", headers=headers, timeout=10.0)
        assert resp.status_code == 200
        data = resp.json().get("data", [])
        all_ids = {m["id"] for m in data}
        
        # Check that Nemotron flagship models and partner models are present
        expected_nemotrons = {
            "nvidia/nemotron-3-ultra-550b-a55b",
            "nvidia/nemotron-3.5-super-vl-120b-a12b",
            "nvidia/nemotron-3.5-lightning-30b-a3b",
            "nvidia/nemotron-3.5-bolt-e4b",
            "minimaxai/minimax-m3.1-flash",
            "meta/muse-glimmer-30b",
            "moonshotai/kimi-k3.1-pro",
            "z-ai/glm-5.3-flash",
            "mistralai/mistral-large-4-1t-a52b",
        }
        overlap = expected_nemotrons.intersection(all_ids)
        assert len(overlap) > 0, f"None of the expected Nemotron models found in NIM catalog: {all_ids}"

    @pytest.mark.parametrize(
        "model",
        [
            "nvidia/nemotron-3-ultra-550b-a55b",
            "nvidia/nemotron-3.5-super-vl-120b-a12b",
            "minimaxai/minimax-m3.1-flash",
            "meta/muse-glimmer-30b",
            "nvidia/nemotron-3.5-bolt-e4b",
        ],
    )
    def test_nim_chat_completion(self, model):
        """Verify live chat completion works on NVIDIA NIM models."""
        headers = {
            "Authorization": f"Bearer {_NIM_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "Respond with the word 'PONG'."}],
            "max_tokens": 100,
            "temperature": 0.2,
        }
        resp = httpx.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=30.0,
        )
        assert resp.status_code == 200, f"Inference failed for {model}: {resp.status_code} {resp.text}"
        data = resp.json()
        assert "choices" in data and len(data["choices"]) > 0
        message = data["choices"][0]["message"]
        content = message.get("content") or message.get("reasoning_content") or ""
        assert len(content.strip()) > 0, f"Received empty completion from {model}"
