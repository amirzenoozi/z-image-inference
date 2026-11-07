"""The chat that turns a plain description into a detailed prompt: Grok (xAI) or a local model through Ollama, chosen by
CHAT_PROVIDER in .env. Both stream the reply in pieces as it is written; a failure is a ChatError with a message for the user.
"""

import json
import logging
import os
from collections.abc import Iterator
from typing import Protocol

import openai
import requests
from openai import OpenAI

import system_prompts
from i18n import t


GROK_MODEL = "grok-4-1-fast-non-reasoning"
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"
DEFAULT_KEEP_ALIVE = "2m"
# Connecting is quick; the first words can wait for the model to load
OLLAMA_TIMEOUT = (5, 120)

Message = dict[str, str]


class ChatError(Exception):
    """A failed chat: the message is shown to the user, the reason (never the conversation or a key) is logged."""

    def __init__(self, message: str, reason: str) -> None:
        super().__init__(message)
        self.reason = reason


class ChatClient(Protocol):
    name: str

    @property
    def available(self) -> bool: ...

    def chat_stream(self, messages: list[Message]) -> Iterator[str]: ...


def with_system_prompt(system_prompt: str, messages: list[Message]) -> list[Message]:
    return [{"role": "system", "content": system_prompt}, *messages]


class GrokClient:
    name = "Grok"

    @property
    def available(self) -> bool:
        return bool(os.environ.get("XAI_API_KEY", "").strip())

    def chat_stream(self, messages: list[Message]) -> Iterator[str]:
        """Stream a rewritten prompt for the conversation, which ends with the user's message."""
        try:
            client = OpenAI(api_key=os.environ.get("XAI_API_KEY", "").strip(), base_url="https://api.x.ai/v1")
            response = client.chat.completions.create(model=GROK_MODEL, messages=with_system_prompt(system_prompts.GROK, messages), stream=True)
            for chunk in response:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except openai.OpenAIError as error:
            raise ChatError(t("chatError", name=self.name, error=error), type(error).__name__) from error


def keep_alive_value(value: str) -> str | int:
    """Ollama reads a bare number as seconds but a string only with a unit (2m, 30s), so "0" and "300" are sent as numbers."""
    return int(value) if value.lstrip("-").isdigit() else value


class OllamaClient:
    """A model on this Mac, served by Ollama; it loads for a chat and unloads after keep_alive without one."""

    def __init__(self, url: str, model: str, keep_alive: str) -> None:
        self.url = url.rstrip("/")
        self.model = model
        self.name = model or "Ollama"
        self.keep_alive = keep_alive_value(keep_alive)

    @property
    def available(self) -> bool:
        return bool(self.model)

    def chat_stream(self, messages: list[Message]) -> Iterator[str]:
        body = {"model": self.model, "messages": with_system_prompt(system_prompts.OLLAMA, messages), "stream": True, "keep_alive": self.keep_alive}
        try:
            with requests.post(f"{self.url}/api/chat", json=body, stream=True, timeout=OLLAMA_TIMEOUT) as response:
                self.check_answer(response)
                for line in response.iter_lines():
                    if piece := self.piece_of(line):
                        yield piece
        except requests.ConnectionError as error:
            raise ChatError(t("ollamaNotRunning"), "Ollama is not running") from error
        except requests.RequestException as error:
            raise ChatError(t("chatError", name=self.name, error=error), type(error).__name__) from error

    def check_answer(self, response: requests.Response) -> None:
        if response.status_code == 404:
            raise ChatError(t("ollamaModelMissing", model=self.model), "model not downloaded")
        if not response.ok:
            raise ChatError(t("chatError", name=self.name, error=response.text or response.status_code), f"status {response.status_code}")

    def piece_of(self, line: bytes) -> str:
        """One line of Ollama's stream: a piece of the reply (empty for a blank line or the last one), or an error that stopped it."""
        if not line:
            return ""
        data = json.loads(line)
        if "error" in data:
            raise ChatError(t("chatError", name=self.name, error=data["error"]), "error in the stream")
        return str(data.get("message", {}).get("content", ""))


def chat_client() -> ChatClient | None:
    """The chat CHAT_PROVIDER in .env picks (available once set up: Grok with a key, Ollama with a model); None for an unknown one."""
    provider = os.environ.get("CHAT_PROVIDER", "grok").strip().lower()
    if provider == "ollama":
        env = os.environ.get
        return OllamaClient(env("OLLAMA_URL", DEFAULT_OLLAMA_URL).strip(), env("OLLAMA_MODEL", "").strip(), env("OLLAMA_KEEP_ALIVE", DEFAULT_KEEP_ALIVE).strip())
    if provider == "grok":
        return GrokClient()
    logging.getLogger(__name__).warning("CHAT_PROVIDER=%r is not grok or ollama; chat is off.", provider)
    return None


def ready_chat() -> ChatClient | None:
    """The chat to use, or None while it is off: what the catalog offers and what /api/chat accepts."""
    client = chat_client()
    return client if client is not None and client.available else None
