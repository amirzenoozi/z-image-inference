from pathlib import Path

import pytest

import chat_store
import history_store
from chat_store import ChatNotFound, ChatSource, NewExchange, Outcome

SOURCE = ChatSource(provider="ollama", model="gemma-3-4b", system_prompt_id=chat_store.system_prompt_id("Rewrite it."))


@pytest.fixture(autouse=True)
def database(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.db")
    history_store.init_db()


def answered(question: str, answer: str, conversation_id: int | None = None, parent_id: int | None = None) -> chat_store.StartedExchange:
    started = chat_store.start(NewExchange(question=question, source=SOURCE, conversation_id=conversation_id, parent_id=parent_id))
    chat_store.finish(started.id, Outcome(answer=answer, status="complete", first_words_ms=900, total_ms=5200))
    return started


def saved(conversation_id: int) -> chat_store.Conversation:
    conversation = chat_store.conversation(conversation_id)
    assert conversation is not None
    return conversation


def test_a_first_question_starts_a_conversation_and_saves_the_answer_with_its_timings() -> None:
    started = answered("a fox", "A red fox in the snow")

    assert started.new_conversation
    conversation = saved(started.conversation_id)
    assert conversation.title is None
    exchange, = conversation.exchanges
    assert (exchange.question, exchange.answer, exchange.status) == ("a fox", "A red fox in the snow", "complete")
    assert (exchange.first_words_ms, exchange.total_ms, exchange.parent_id) == (900, 5200, None)
    assert (exchange.provider, exchange.model, exchange.system_prompt_id) == ("ollama", "gemma-3-4b", SOURCE.system_prompt_id)


def test_a_follow_up_continues_the_conversation_from_the_last_answer() -> None:
    first = answered("a fox", "A red fox")
    follow_up = answered("make it night", "A red fox at night", first.conversation_id, first.id)

    assert not follow_up.new_conversation
    assert [exchange.parent_id for exchange in saved(first.conversation_id).exchanges] == [None, first.id]


def test_an_edited_question_is_a_new_branch_and_both_are_kept() -> None:
    first = answered("a fox", "A red fox")
    answered("make it night", "A red fox at night", first.conversation_id, first.id)
    answered("make it summer", "A red fox in summer", first.conversation_id, first.id)

    exchanges = saved(first.conversation_id).exchanges
    assert [exchange.question for exchange in exchanges] == ["a fox", "make it night", "make it summer"]
    assert [exchange.parent_id for exchange in exchanges[1:]] == [first.id, first.id]


def test_a_finished_exchange_is_never_changed() -> None:
    first = answered("a fox", "A red fox")
    chat_store.finish(first.id, Outcome(answer="something else", status="stopped", first_words_ms=1, total_ms=2))

    exchange, = saved(first.conversation_id).exchanges
    assert (exchange.answer, exchange.status) == ("A red fox", "complete")


def test_unknown_or_foreign_ids_are_refused() -> None:
    first = answered("a fox", "A red fox")
    other = answered("a cat", "A grey cat")

    with pytest.raises(ChatNotFound):
        chat_store.start(NewExchange(question="more", source=SOURCE, conversation_id=999))
    with pytest.raises(ChatNotFound):
        chat_store.start(NewExchange(question="more", source=SOURCE, conversation_id=first.conversation_id, parent_id=other.id))
    with pytest.raises(ChatNotFound):
        chat_store.check_exchange(999)


def test_the_title_is_cleaned_and_set_once() -> None:
    first = answered("a fox", "A red fox")
    chat_store.set_title(first.conversation_id, '  "Red Fox in Winter Snow"\nA title for your image.')
    chat_store.set_title(first.conversation_id, "Another title")
    assert saved(first.conversation_id).title == "Red Fox in Winter Snow"


def test_the_first_image_made_from_an_answer_stays_linked() -> None:
    first = answered("a fox", "A red fox")
    chat_store.link_image(first.id, 7)
    chat_store.link_image(first.id, 8)
    assert saved(first.conversation_id).exchanges[0].history_id == 7


def test_a_sensitive_answer_is_marked() -> None:
    first = answered("a portrait", "A nude portrait in soft light")
    assert saved(first.conversation_id).exchanges[0].sensitive
