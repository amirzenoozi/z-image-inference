"""Saved chats, in history.db: a conversation (with a title written by the chat model) and its exchanges, each one
question and the answer to it.

Exchanges are only ever added: an exchange is created when its question is sent and completed once, when its answer
ends. Editing an earlier question in the chat makes a new exchange whose parent is the one before it, so both branches
are kept.
"""

import hashlib
import sqlite3
from dataclasses import dataclass
from typing import Literal

from history_store import connection
from i18n import t
from sensitive import is_sensitive

# refused: a decision task (decision_tasks.py) refused the question, so the chat model was never asked
ExchangeStatus = Literal["streaming", "complete", "failed", "stopped", "refused"]
MAX_TITLE_LENGTH = 80


class ChatNotFound(ValueError):
    """A conversation, parent or exchange id that isn't saved, or a parent from another conversation."""


@dataclass(frozen=True)
class ChatSource:
    """Who answers: the provider (grok, ollama), its model, and which system prompt it was given."""

    provider: str
    model: str
    system_prompt_id: str


@dataclass(frozen=True)
class NewExchange:
    question: str
    source: ChatSource
    # None starts a new conversation
    conversation_id: int | None = None
    # The exchange this one continues; None for a conversation's first question, or an edit of it
    parent_id: int | None = None


@dataclass(frozen=True)
class StartedExchange:
    id: int
    conversation_id: int
    new_conversation: bool


@dataclass(frozen=True)
class Outcome:
    answer: str
    status: ExchangeStatus
    first_words_ms: int | None
    total_ms: int
    error: str | None = None


@dataclass(frozen=True)
class Exchange:
    id: int
    parent_id: int | None
    question: str
    answer: str
    created_at: str
    first_words_ms: int | None
    total_ms: int | None
    provider: str
    model: str
    system_prompt_id: str
    status: ExchangeStatus
    error: str | None
    sensitive: bool
    history_id: int | None


@dataclass(frozen=True)
class Conversation:
    id: int
    title: str | None
    created_at: str
    exchanges: list[Exchange]


def system_prompt_id(system_prompt: str) -> str:
    """A short fingerprint of a system prompt, so answers from before and after a prompt change can be told apart."""
    return hashlib.sha256(system_prompt.encode()).hexdigest()[:12]


def start(new: NewExchange) -> StartedExchange:
    """Saves the question before its answer streams, so the exchange has an id to send with the answer."""
    with connection() as conn:
        conversation_id = new.conversation_id
        if conversation_id is None:
            conversation_id = int(conn.execute("INSERT INTO chat_conversations DEFAULT VALUES").lastrowid or 0)
        else:
            check_conversation(conn, conversation_id)
        if new.parent_id is not None:
            check_parent(conn, new.parent_id, conversation_id)
        cursor = conn.execute(
            "INSERT INTO chat_exchanges (conversation_id, parent_id, question, provider, model, system_prompt_id, status) VALUES (?, ?, ?, ?, ?, ?, 'streaming')",
            (conversation_id, new.parent_id, new.question, new.source.provider, new.source.model, new.source.system_prompt_id),
        )
        return StartedExchange(id=int(cursor.lastrowid or 0), conversation_id=conversation_id, new_conversation=new.conversation_id is None)


def check_conversation(conn: sqlite3.Connection, conversation_id: int) -> None:
    if conn.execute("SELECT 1 FROM chat_conversations WHERE id = ?", (conversation_id,)).fetchone() is None:
        raise ChatNotFound(t("chatNotFound"))


def check_parent(conn: sqlite3.Connection, parent_id: int, conversation_id: int) -> None:
    row = conn.execute("SELECT conversation_id FROM chat_exchanges WHERE id = ?", (parent_id,)).fetchone()
    if row is None or row[0] != conversation_id:
        raise ChatNotFound(t("chatNotFound"))


def finish(exchange_id: int, outcome: Outcome) -> None:
    """Completes an exchange once; one that already ended is never changed."""
    with connection() as conn:
        row = conn.execute("SELECT question FROM chat_exchanges WHERE id = ?", (exchange_id,)).fetchone()
        if row is None:
            return
        sensitive = is_sensitive(f"{row[0]} {outcome.answer}")
        conn.execute(
            "UPDATE chat_exchanges SET answer = ?, status = ?, first_words_ms = ?, total_ms = ?, error = ?, sensitive = ? WHERE id = ? AND status = 'streaming'",
            (outcome.answer, outcome.status, outcome.first_words_ms, outcome.total_ms, outcome.error, int(sensitive), exchange_id),
        )


def set_title(conversation_id: int, title: str) -> None:
    """The first line of what the model wrote, without quotes, shortened; an empty one leaves the title unset."""
    lines = title.strip().splitlines()
    cleaned = (lines[0] if lines else "").strip().strip("\"'“”‘’*#").strip()[:MAX_TITLE_LENGTH]
    if not cleaned:
        return
    with connection() as conn:
        conn.execute("UPDATE chat_conversations SET title = ? WHERE id = ? AND title IS NULL", (cleaned, conversation_id))


def check_exchange(exchange_id: int) -> None:
    """Refuses an image link to an exchange that isn't saved (a stale tab, or a made-up id)."""
    with connection() as conn:
        if conn.execute("SELECT 1 FROM chat_exchanges WHERE id = ?", (exchange_id,)).fetchone() is None:
            raise ChatNotFound(t("chatAnswerNotFound"))


def link_image(exchange_id: int, history_id: int) -> None:
    """Records the image made from an answer; the first one made stays linked."""
    with connection() as conn:
        conn.execute("UPDATE chat_exchanges SET history_id = ? WHERE id = ? AND history_id IS NULL", (history_id, exchange_id))


def conversation(conversation_id: int) -> Conversation | None:
    """A conversation with every exchange in it, oldest first, edits and their branches included."""
    with connection() as conn:
        row = conn.execute("SELECT id, title, created_at FROM chat_conversations WHERE id = ?", (conversation_id,)).fetchone()
        if row is None:
            return None
        rows = conn.execute(
            "SELECT id, parent_id, question, answer, created_at, first_words_ms, total_ms, provider, model, system_prompt_id, status, error, sensitive, history_id "
            "FROM chat_exchanges WHERE conversation_id = ? ORDER BY id",
            (conversation_id,),
        ).fetchall()
    exchanges = [Exchange(*values[:12], bool(values[12]), values[13]) for values in rows]
    return Conversation(id=row[0], title=row[1], created_at=row[2], exchanges=exchanges)
