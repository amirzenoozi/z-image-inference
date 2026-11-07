import io
import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from types import SimpleNamespace

import pytest
import requests

import chat_client
import system_prompts
from chat_client import ChatError, GrokClient, OllamaClient

MODEL = "hf.co/mlabonne/gemma-3-4b-it-abliterated-GGUF:Q4_K_M"
MESSAGES = [{"role": "user", "content": "a lighthouse"}]


def reply_lines(*pieces: str) -> list[bytes]:
    lines = [json.dumps({"message": {"role": "assistant", "content": piece}, "done": False}).encode() for piece in pieces]
    return [*lines, b"", json.dumps({"done": True}).encode()]


@dataclass
class FakeOllama:
    """Stands in for requests.post to Ollama: answers with a status and streamed lines, or fails to connect."""

    status: int = 200
    lines: list[bytes] = field(default_factory=lambda: reply_lines("A tall ", "lighthouse"))
    error: Exception | None = None
    sent: list[dict[str, object]] = field(default_factory=list)

    def post(self, url: str, json: dict[str, object], stream: bool, timeout: tuple[int, int]) -> requests.Response:
        self.sent.append({"url": url, "stream": stream, **json})
        if self.error:
            raise self.error
        response = requests.Response()
        response.status_code = self.status
        response.raw = io.BytesIO(b"\n".join(self.lines))
        return response


@pytest.fixture
def ollama(monkeypatch: pytest.MonkeyPatch) -> FakeOllama:
    fake = FakeOllama()
    monkeypatch.setattr(chat_client.requests, "post", fake.post)
    return fake


def stream(client: OllamaClient) -> Iterator[str]:
    return client.chat_stream(MESSAGES, client.system_prompt)


def local(keep_alive: str = "2m") -> OllamaClient:
    return OllamaClient("http://127.0.0.1:11434/", MODEL, keep_alive)


def test_ollama_streams_the_reply_piece_by_piece_with_the_system_prompt(ollama: FakeOllama) -> None:
    assert list(stream(local())) == ["A tall ", "lighthouse"]

    sent, = ollama.sent
    assert sent["url"] == "http://127.0.0.1:11434/api/chat"
    assert (sent["stream"], sent["model"], sent["keep_alive"]) == (True, MODEL, "2m")
    assert sent["messages"] == [{"role": "system", "content": system_prompts.OLLAMA}, *MESSAGES]


@pytest.mark.parametrize(("keep_alive", "sent"), [("2m", "2m"), ("30s", "30s"), ("0", 0), ("300", 300), ("-1", -1)])
def test_keep_alive_without_a_unit_is_sent_as_seconds(ollama: FakeOllama, keep_alive: str, sent: str | int) -> None:
    list(stream(local(keep_alive)))
    assert ollama.sent[0]["keep_alive"] == sent


def test_ollama_not_running(ollama: FakeOllama) -> None:
    ollama.error = requests.ConnectionError()
    with pytest.raises(ChatError, match="Ollama is not running") as raised:
        list(stream(local()))
    assert raised.value.reason == "Ollama is not running"


def test_a_model_not_downloaded_says_how_to_get_it(ollama: FakeOllama) -> None:
    ollama.status = 404
    with pytest.raises(ChatError, match=f"run ollama pull {MODEL}"):
        list(stream(local()))


def test_an_error_inside_the_stream_stops_it(ollama: FakeOllama) -> None:
    ollama.lines = [*reply_lines("A tall ")[:1], json.dumps({"error": "out of memory"}).encode()]
    pieces = stream(local())
    assert next(pieces) == "A tall "
    with pytest.raises(ChatError, match="out of memory"):
        next(pieces)


class FakeOpenAI:
    """Stands in for the OpenAI client Grok is reached through: records the request, streams two pieces."""

    sent: list[dict[str, object]] = []

    def __init__(self, api_key: str, base_url: str) -> None:
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **request: object) -> Iterator[SimpleNamespace]:
        FakeOpenAI.sent.append(request)
        return iter(SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content=piece))]) for piece in ["A tall ", "lighthouse"])


def test_grok_streams_the_reply_with_its_own_system_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(chat_client, "OpenAI", FakeOpenAI)
    monkeypatch.setattr(FakeOpenAI, "sent", [])
    grok = GrokClient()
    assert list(grok.chat_stream(MESSAGES, grok.system_prompt)) == ["A tall ", "lighthouse"]
    sent, = FakeOpenAI.sent
    assert sent["messages"] == [{"role": "system", "content": system_prompts.GROK}, *MESSAGES]


def test_chat_provider_picks_the_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CHAT_PROVIDER", raising=False)
    monkeypatch.setenv("XAI_API_KEY", "")
    assert isinstance(chat_client.chat_client(), GrokClient)
    assert chat_client.ready_chat() is None

    monkeypatch.setenv("CHAT_PROVIDER", " Ollama ")
    monkeypatch.delenv("OLLAMA_MODEL", raising=False)
    waiting = chat_client.chat_client()
    assert isinstance(waiting, OllamaClient) and waiting.name == "Ollama"
    assert chat_client.ready_chat() is None

    monkeypatch.setenv("OLLAMA_MODEL", MODEL)
    ready = chat_client.ready_chat()
    assert isinstance(ready, OllamaClient) and ready.name == MODEL


def test_an_unknown_chat_provider_turns_chat_off(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setenv("CHAT_PROVIDER", "llamafile")
    assert chat_client.ready_chat() is None
    assert "CHAT_PROVIDER='llamafile' is not grok or ollama; chat is off." in caplog.text
