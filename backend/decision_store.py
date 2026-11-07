"""Laya's saved decisions on chat questions, in history.db: which task ran on which exchange, what it decided and the
probabilities it decided from. The question's text stays in chat_exchanges; errors are logged, not saved.
"""

import json
from dataclasses import dataclass
from typing import Literal

from history_store import connection

DecisionOutcome = Literal["pass", "refuse", "error"]


@dataclass(frozen=True)
class SavedDecision:
    trace_id: str
    task: str
    task_version: str
    chat_exchange_id: int
    outcome: DecisionOutcome
    # Each question's main value, such as {"nudity": 0.04}; empty for an error
    answers: dict[str, object]
    decide_ms: int | None


def save(decision: SavedDecision) -> None:
    with connection() as conn:
        conn.execute(
            "INSERT INTO decision_tasks (trace_id, task, task_version, chat_exchange_id, outcome, answers, decide_ms) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (decision.trace_id, decision.task, decision.task_version, decision.chat_exchange_id, decision.outcome, json.dumps(decision.answers), decision.decide_ms),
        )


def for_exchange(chat_exchange_id: int) -> list[SavedDecision]:
    """The decisions made on one chat question, oldest first."""
    with connection() as conn:
        rows = conn.execute(
            "SELECT trace_id, task, task_version, chat_exchange_id, outcome, answers, decide_ms FROM decision_tasks WHERE chat_exchange_id = ? ORDER BY id",
            (chat_exchange_id,),
        ).fetchall()
    return [SavedDecision(*row[:5], json.loads(row[5]), row[6]) for row in rows]
