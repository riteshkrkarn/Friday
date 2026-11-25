"""Backend unit tests for cloud key setup, NIM reasoning fallback, and model routing."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from openjarvis.core import credentials
from openjarvis.core.types import Message, Role
from openjarvis.engine.nim import NIMEngine
from openjarvis.server import cloud_router, routes


# ---------------------------------------------------------------------------
# credentials.inject_credentials
# ---------------------------------------------------------------------------


def test_inject_credentials_loads_toml_cloud_env_and_workspace_env(tmp_path, monkeypatch):
    config_dir = tmp_path / "config"
    config_dir.mkdir()
    cred_path = config_dir / "credentials.toml"
    credentials.save_credential("telegram", "TELEGRAM_BOT_TOKEN", "tg-from-toml", path=cred_path)

    cloud_env = config_dir / "cloud-keys.env"
    cloud_env.write_text(
        '# comment\n'
        'NIM_API_KEY="nvapi-from-cloud-env"\n'
        "GROQ_API_KEY='gsk-from-cloud-env'\n",
        encoding="utf-8",
    )

    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / ".env").write_text(
        "NIM_API_KEY=should-not-override-cloud-env\n"
        'OPENAI_API_KEY="sk-from-dotenv"\n',
        encoding="utf-8",
    )

    for key in ("TELEGRAM_BOT_TOKEN", "NIM_API_KEY", "GROQ_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("OPENROUTER_API_KEY", "already-in-env")
    (workspace / ".env").write_text(
        (workspace / ".env").read_text(encoding="utf-8") + "OPENROUTER_API_KEY=from-dotenv\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(credentials, "get_config_dir", lambda: config_dir)
    monkeypatch.chdir(workspace)

    credentials.inject_credentials(path=cred_path)

    assert credentials.os.environ["TELEGRAM_BOT_TOKEN"] == "tg-from-toml"
    assert credentials.os.environ["NIM_API_KEY"] == "nvapi-from-cloud-env"
    assert credentials.os.environ["GROQ_API_KEY"] == "gsk-from-cloud-env"
    assert credentials.os.environ["OPENAI_API_KEY"] == "sk-from-dotenv"
    # Existing os.environ must win over files
    assert credentials.os.environ["OPENROUTER_API_KEY"] == "already-in-env"


# ---------------------------------------------------------------------------
# cloud_router: Groq detection, key loading, and reasoning_content fallback
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "model",
    ["groq/openai/gpt-oss-120b", "groq/qwen/qwen3.8-27b", "groq-llama3"],
)
def test_get_provider_detects_groq(model):
    assert cloud_router.get_provider(model) == "groq"
    assert cloud_router.is_cloud_model(model)


def test_load_keys_reads_groq_key_and_allows_env_override(tmp_path, monkeypatch):
    env_file = tmp_path / "cloud-keys.env"
    env_file.write_text('GROQ_API_KEY="gsk-from-file"\n', encoding="utf-8")
    monkeypatch.setattr(cloud_router, "_CLOUD_ENV_FILE", env_file)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    assert cloud_router._load_keys()["GROQ_API_KEY"] == "gsk-from-file"

    monkeypatch.setenv("GROQ_API_KEY", "gsk-from-env")
    assert cloud_router._load_keys()["GROQ_API_KEY"] == "gsk-from-env"


def test_stream_cloud_groq_requires_key(tmp_path, monkeypatch):
    monkeypatch.setattr(cloud_router, "_CLOUD_ENV_FILE", tmp_path / "missing.env")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    async def _run():
        return [
            t
            async for t in cloud_router.stream_cloud(
                "groq/openai/gpt-oss-20b", [Message(role="user", content="hi")]
            )
        ]

    with pytest.raises(ValueError, match="GROQ_API_KEY not set"):
        asyncio.run(_run())


@pytest.mark.parametrize(
    "requested_model,expected_model",
    [
        ("groq/openai/gpt-oss-120b", "openai/gpt-oss-120b"),
        ("groq-allam-2-7b", "allam-2-7b"),
    ],
)
def test_stream_cloud_groq_strips_prefix_and_targets_groq_endpoint(
    monkeypatch, requested_model, expected_model
):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    captured: dict[str, str] = {}

    async def fake_stream_openai(
        model, messages, temperature, max_tokens, *, base_url="", api_key_name=""
    ):
        captured["model"] = model
        captured["base_url"] = base_url
        captured["api_key_name"] = api_key_name
        yield "ok"

    monkeypatch.setattr(cloud_router, "_stream_openai", fake_stream_openai)

    async def _run():
        return [
            t
            async for t in cloud_router.stream_cloud(
                requested_model, [Message(role="user", content="hi")]
            )
        ]

    tokens = asyncio.run(_run())
    assert tokens == ["ok"]
    assert captured == {
        "model": expected_model,
        "base_url": "https://api.groq.com/openai/v1",
        "api_key_name": "GROQ_API_KEY",
    }


def test_stream_openai_falls_back_to_reasoning_content(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    lines = [
        'data: {"choices":[{"delta":{"content":null,"reasoning_content":"think "}}]}',
        'data: {"choices":[{"delta":{"content":"answer"}}]}',
        "data: [DONE]",
    ]

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def aiter_lines(self):
            for line in lines:
                yield line

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        def stream(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(cloud_router.httpx, "AsyncClient", FakeClient)

    async def _run():
        return [
            t
            async for t in cloud_router._stream_openai(
                "gpt-4o", [Message(role="user", content="hi")], 0.2, 64
            )
        ]

    assert asyncio.run(_run()) == ["think ", "answer"]


# ---------------------------------------------------------------------------
# NIMEngine reasoning_content fallback
# ---------------------------------------------------------------------------


def test_nim_generate_falls_back_to_reasoning_content(monkeypatch):
    monkeypatch.setenv("NIM_API_KEY", "nvapi-test")
    engine = NIMEngine(host="https://integrate.api.nvidia.com")

    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.raise_for_status = MagicMock()
    fake_resp.json.return_value = {
        "model": "nvidia/nemotron-3-ultra-550b-a55b",
        "choices": [
            {
                "message": {"content": None, "reasoning_content": "reasoned reply"},
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 5, "completion_tokens": 3},
    }
    monkeypatch.setattr(engine._client, "post", lambda *args, **kwargs: fake_resp)

    out = engine.generate([Message(role=Role.USER, content="hi")], model="nvidia/nemotron-3-ultra-550b-a55b")
    assert out["content"] == "reasoned reply"


def test_nim_stream_and_stream_full_fall_back_to_reasoning_content(monkeypatch):
    monkeypatch.setenv("NIM_API_KEY", "nvapi-test")
    engine = NIMEngine(host="https://integrate.api.nvidia.com")

    sse_lines = [
        'data: ' + json.dumps({"choices": [{"delta": {"content": None, "reasoning_content": "step1 "}, "finish_reason": None}]}),
        'data: ' + json.dumps({"choices": [{"delta": {"content": "done"}, "finish_reason": "stop"}]}),
        "data: [DONE]",
    ]

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def aiter_lines(self):
            for line in sse_lines:
                yield line

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        def stream(self, *args, **kwargs):
            return FakeResponse()

    import openjarvis.engine.nim as nim_mod

    monkeypatch.setattr(nim_mod.httpx, "AsyncClient", FakeAsyncClient)

    async def _run():
        tokens = [
            t
            async for t in engine.stream(
                [Message(role=Role.USER, content="hi")],
                model="nvidia/nemotron-3-ultra-550b-a55b",
            )
        ]
        chunks = [
            c
            async for c in engine.stream_full(
                [Message(role=Role.USER, content="hi")],
                model="nvidia/nemotron-3-ultra-550b-a55b",
            )
        ]
        return tokens, chunks

    tokens, chunks = asyncio.run(_run())
    assert tokens == ["step1 ", "done"]
    assert [c.content for c in chunks] == ["step1 ", "done"]
    assert chunks[-1].finish_reason == "stop"


# ---------------------------------------------------------------------------
# routes.list_models cloud key prioritization & Groq listing
# ---------------------------------------------------------------------------


def test_list_models_includes_groq_and_prioritizes_curated_nim(monkeypatch):
    monkeypatch.setattr(
        cloud_router,
        "_load_keys",
        lambda: {"GROQ_API_KEY": "gsk-test", "NIM_API_KEY": "nvapi-test"},
    )
    monkeypatch.setenv("NIM_API_KEY", "nvapi-test")

    fake_engine = MagicMock()
    fake_engine.engine_id = "nim"
    fake_engine.list_models.return_value = [
        "other/model-z",
        "meta/muse-glimmer-30b",
        "nvidia/nemotron-3-ultra-550b-a55b",
        "nomic-embed-text",
    ]
    fake_request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                engine=fake_engine,
                config=SimpleNamespace(engine=SimpleNamespace(default_model="")),
            )
        )
    )

    resp = asyncio.run(routes.list_models(fake_request))
    ids = [m.id for m in resp.data]

    assert "nomic-embed-text" not in ids
    assert "groq/openai/gpt-oss-120b" in ids
    # Curated NIM models should appear before uncurated models
    assert ids.index("nvidia/nemotron-3-ultra-550b-a55b") < ids.index("other/model-z")
    assert ids.index("meta/muse-glimmer-30b") < ids.index("other/model-z")
