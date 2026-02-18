"""
LLM Provider abstraction layer.

Supports multiple LLM backends:
- Ollama (local, default)
- OpenAI (GPT-4o, GPT-4o-mini)
- Anthropic (Claude 3.5 Sonnet, Claude 3 Haiku)

Each provider implements streaming and non-streaming chat completions
with a unified interface.
"""

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:12434")
OLLAMA_CHAT_MODEL = os.getenv("OLLAMA_CHAT_MODEL", "deepseek-r1:7b")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OLLAMA_MAX_TOKENS = int(os.getenv("OLLAMA_MAX_TOKENS", "2048"))


# ---------------------------------------------------------------------------
# Provider / Model registry
# ---------------------------------------------------------------------------

@dataclass
class ModelInfo:
    """Metadata for a selectable model."""
    id: str
    name: str
    provider: str
    description: str


# All available models exposed to the frontend.
MODEL_REGISTRY: List[ModelInfo] = [
    ModelInfo(
        id="ollama/deepseek-r1:7b",
        name="DeepSeek-R1 7B",
        provider="ollama",
        description="Local - fast reasoning model (default)",
    ),
    ModelInfo(
        id="ollama/llama3:8b",
        name="Llama 3 8B",
        provider="ollama",
        description="Local - Meta's open model",
    ),
    ModelInfo(
        id="openai/gpt-4o",
        name="GPT-4o",
        provider="openai",
        description="OpenAI - flagship multimodal model",
    ),
    ModelInfo(
        id="openai/gpt-4o-mini",
        name="GPT-4o Mini",
        provider="openai",
        description="OpenAI - fast and affordable",
    ),
    ModelInfo(
        id="anthropic/claude-sonnet-4-5-20250929",
        name="Claude Sonnet 4.5",
        provider="anthropic",
        description="Anthropic - balanced speed & intelligence",
    ),
    ModelInfo(
        id="anthropic/claude-haiku-4-5-20251001",
        name="Claude Haiku 4.5",
        provider="anthropic",
        description="Anthropic - fast and compact",
    ),
]

DEFAULT_MODEL_ID = f"ollama/{OLLAMA_CHAT_MODEL}"


def get_available_models() -> List[Dict[str, str]]:
    """Return the model list for the frontend, filtering out providers
    without configured API keys."""
    models = []
    for m in MODEL_REGISTRY:
        if m.provider == "ollama":
            models.append({"id": m.id, "name": m.name, "provider": m.provider, "description": m.description})
        elif m.provider == "openai" and OPENAI_API_KEY:
            models.append({"id": m.id, "name": m.name, "provider": m.provider, "description": m.description})
        elif m.provider == "anthropic" and ANTHROPIC_API_KEY:
            models.append({"id": m.id, "name": m.name, "provider": m.provider, "description": m.description})
    return models


def parse_model_id(model_id: Optional[str]) -> tuple[str, str]:
    """Parse a model_id like 'openai/gpt-4o' into (provider, model).

    Falls back to ('ollama', OLLAMA_CHAT_MODEL) for unknown IDs.
    """
    if not model_id:
        return ("ollama", OLLAMA_CHAT_MODEL)

    if "/" in model_id:
        provider, model = model_id.split("/", 1)
        if provider in ("ollama", "openai", "anthropic"):
            return (provider, model)

    # Bare model name → assume ollama
    return ("ollama", model_id)


# ---------------------------------------------------------------------------
# Unified streaming interface
# ---------------------------------------------------------------------------

async def stream_chat(
    messages: List[Dict[str, str]],
    model_id: Optional[str] = None,
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    """Stream chat completion tokens from the selected provider.

    Yields individual content tokens as plain strings.
    """
    provider, model = parse_model_id(model_id)

    if provider == "openai":
        async for token in _stream_openai(messages, model, temperature):
            yield token
    elif provider == "anthropic":
        async for token in _stream_anthropic(messages, model, temperature):
            yield token
    else:
        async for token in _stream_ollama(messages, model, temperature):
            yield token


async def chat(
    messages: List[Dict[str, str]],
    model_id: Optional[str] = None,
    temperature: float = 0.7,
) -> str:
    """Non-streaming chat completion. Returns the full response text."""
    provider, model = parse_model_id(model_id)

    if provider == "openai":
        return await _chat_openai(messages, model, temperature)
    elif provider == "anthropic":
        return await _chat_anthropic(messages, model, temperature)
    else:
        return await _chat_ollama(messages, model, temperature)


# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------

def _strip_think_tags(text: str) -> str:
    """Remove DeepSeek-R1 <think>…</think> reasoning blocks from output."""
    return re.sub(r"<think>[\s\S]*?</think>", "", text).strip()


async def _stream_ollama(
    messages: List[Dict[str, str]], model: str, temperature: float
) -> AsyncGenerator[str, None]:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "options": {"num_predict": OLLAMA_MAX_TOKENS},
                },
            ) as response:
                response.raise_for_status()
                in_think = False
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        token = data.get("message", {}).get("content", "")
                        if data.get("done", False):
                            return
                        if not token:
                            continue
                        # Filter <think> blocks from reasoning models
                        if "<think>" in token:
                            in_think = True
                            continue
                        if "</think>" in token:
                            in_think = False
                            continue
                        if in_think:
                            continue
                        yield token
                    except json.JSONDecodeError:
                        continue
    except httpx.ConnectError:
        yield "Cannot connect to the Ollama service. Please ensure it is running."
    except Exception as exc:
        logger.error("Ollama streaming error: %s", exc)
        yield f"Error: {exc}"


async def _chat_ollama(
    messages: List[Dict[str, str]], model: str, temperature: float
) -> str:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": {"num_predict": OLLAMA_MAX_TOKENS},
                },
            )
            resp.raise_for_status()
            raw = resp.json().get("message", {}).get("content", "")
            return _strip_think_tags(raw)
    except Exception as exc:
        logger.error("Ollama chat error: %s", exc)
        return f"Error communicating with Ollama: {exc}"


# ---------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------

async def _stream_openai(
    messages: List[Dict[str, str]], model: str, temperature: float
) -> AsyncGenerator[str, None]:
    if not OPENAI_API_KEY:
        yield "OpenAI API key not configured. Set OPENAI_API_KEY in your environment."
        return

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            async with client.stream(
                "POST",
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=body,
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    yield f"OpenAI error ({response.status_code}): {error_body.decode()[:200]}"
                    return

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        return
                    try:
                        data = json.loads(data_str)
                        delta = data.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield token
                    except (json.JSONDecodeError, IndexError):
                        continue
    except Exception as exc:
        logger.error("OpenAI streaming error: %s", exc)
        yield f"Error communicating with OpenAI: {exc}"


async def _chat_openai(
    messages: List[Dict[str, str]], model: str, temperature: float
) -> str:
    if not OPENAI_API_KEY:
        return "OpenAI API key not configured. Set OPENAI_API_KEY in your environment."

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=body,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as exc:
        logger.error("OpenAI chat error: %s", exc)
        return f"Error communicating with OpenAI: {exc}"


# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------

async def _stream_anthropic(
    messages: List[Dict[str, str]], model: str, temperature: float
) -> AsyncGenerator[str, None]:
    if not ANTHROPIC_API_KEY:
        yield "Anthropic API key not configured. Set ANTHROPIC_API_KEY in your environment."
        return

    # Anthropic separates the system prompt from messages
    system_prompt = ""
    api_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_prompt += msg["content"] + "\n"
        else:
            api_messages.append({"role": msg["role"], "content": msg["content"]})

    # Ensure messages alternate user/assistant; Anthropic requires first msg to be user
    if not api_messages or api_messages[0]["role"] != "user":
        api_messages.insert(0, {"role": "user", "content": "Hello"})

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "max_tokens": 4096,
        "messages": api_messages,
        "stream": True,
        "temperature": temperature,
    }
    if system_prompt.strip():
        body["system"] = system_prompt.strip()

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            async with client.stream(
                "POST",
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json=body,
            ) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    yield f"Anthropic error ({response.status_code}): {error_body.decode()[:200]}"
                    return

                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    try:
                        data = json.loads(data_str)
                        event_type = data.get("type", "")
                        if event_type == "content_block_delta":
                            token = data.get("delta", {}).get("text", "")
                            if token:
                                yield token
                        elif event_type == "message_stop":
                            return
                    except json.JSONDecodeError:
                        continue
    except Exception as exc:
        logger.error("Anthropic streaming error: %s", exc)
        yield f"Error communicating with Anthropic: {exc}"


async def _chat_anthropic(
    messages: List[Dict[str, str]], model: str, temperature: float
) -> str:
    if not ANTHROPIC_API_KEY:
        return "Anthropic API key not configured. Set ANTHROPIC_API_KEY in your environment."

    system_prompt = ""
    api_messages = []
    for msg in messages:
        if msg["role"] == "system":
            system_prompt += msg["content"] + "\n"
        else:
            api_messages.append({"role": msg["role"], "content": msg["content"]})

    if not api_messages or api_messages[0]["role"] != "user":
        api_messages.insert(0, {"role": "user", "content": "Hello"})

    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    body = {
        "model": model,
        "max_tokens": 4096,
        "messages": api_messages,
        "temperature": temperature,
    }
    if system_prompt.strip():
        body["system"] = system_prompt.strip()

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json=body,
            )
            resp.raise_for_status()
            result = resp.json()
            return result.get("content", [{}])[0].get("text", "")
    except Exception as exc:
        logger.error("Anthropic chat error: %s", exc)
        return f"Error communicating with Anthropic: {exc}"
