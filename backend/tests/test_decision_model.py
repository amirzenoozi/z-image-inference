import logging
import sys
from pathlib import Path
import threading
import time
from collections.abc import Callable

import pytest

import decision_model
from decision_model import Decision, DecisionError, LayaRunner
from decision_tasks import NUDITY

YES_NO = {"nudity": {"type": "noul", "instructions": "Nude?", "criteria": {"true": "nude", "false": "dressed"}}}


class FakeLaya:
    """Answers like Laya: every yes/no question with `probability`, a choice with its first option."""

    def __init__(self, probability: float = 0.1, gate: threading.Event | None = None) -> None:
        self.probability = probability
        self.gate = gate
        self.texts: list[str] = []
        self.closed = 0

    def close(self) -> None:
        self.closed += 1

    def predict(self, state: str, questions: dict[str, dict[str, object]]) -> dict[str, object]:
        if self.gate:
            self.gate.wait(timeout=5)
        self.texts.append(state)
        answers: dict[str, object] = {}
        for name, question in questions.items():
            if question["type"] == "noul":
                answers[name] = {"type": "noul", "noul": self.probability, "confidence": 0.5}
            else:
                options = list(question["criteria"])  # type: ignore[arg-type]
                key = "choice" if question["type"] == "choice" else "score"
                answers[name] = {"type": question["type"], key: options[0] if key == "choice" else 1.5,
                                 "probabilities": {option: 1 / len(options) for option in options}}
        return {"answers": answers, "model": "fake"}


class Loads:
    """Counts loads and hands out one FakeLaya, or fails."""

    def __init__(self, laya: FakeLaya | None = None, error: Exception | None = None) -> None:
        self.laya = laya or FakeLaya()
        self.error = error
        self.count = 0

    def __call__(self) -> FakeLaya:
        self.count += 1
        if self.error:
            raise self.error
        return self.laya


class FakeTimer:
    """Stands in for threading.Timer: the test fires it when it wants."""

    made: list["FakeTimer"] = []

    def __init__(self, seconds: float, callback: Callable[[], None]) -> None:
        self.seconds, self.callback, self.cancelled, self.daemon = seconds, callback, False, False
        FakeTimer.made.append(self)

    def start(self) -> None: ...

    def cancel(self) -> None:
        self.cancelled = True


def settle(runner: LayaRunner) -> None:
    """Waits until the worker has done everything queued so far."""
    runner._worker.submit(lambda: None).result(timeout=5)


def test_laya_loads_for_a_task_and_unloads_right_after_by_default(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    loads = Loads()
    runner = LayaRunner(loads)

    decision = runner.decide("a fox in the snow", YES_NO, "nudity")
    settle(runner)

    assert isinstance(decision, Decision) and decision.answers == {"nudity": {"probability": 0.1}}
    assert loads.count == 1 and not runner.loaded() and loads.laya.closed == 1
    lines = [record.getMessage() for record in caplog.records if record.name == "decision"]
    assert any(line.startswith(f"[{decision.trace_id}] Laya loaded in ") for line in lines)
    assert any(line.startswith(f"[{decision.trace_id}] nudity: nudity 0.1 (") for line in lines)
    assert "Laya unloaded" in lines
    assert "fox" not in caplog.text


def test_with_a_keep_alive_laya_stays_loaded_until_nothing_asks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DECISION_KEEP_ALIVE", "60")
    monkeypatch.setattr(decision_model.threading, "Timer", FakeTimer)
    FakeTimer.made = []
    loads = Loads()
    runner = LayaRunner(loads)

    runner.decide("one", YES_NO, "nudity")
    runner.decide("two", YES_NO, "nudity")
    settle(runner)
    assert loads.count == 1 and runner.loaded()
    assert [timer.cancelled for timer in FakeTimer.made] == [True, False]
    assert FakeTimer.made[-1].seconds == 60

    FakeTimer.made[-1].callback()
    settle(runner)
    assert not runner.loaded()


def test_a_task_waiting_behind_another_shares_its_load() -> None:
    gate = threading.Event()
    loads = Loads(FakeLaya(gate=gate))
    runner = LayaRunner(loads)
    results: list[Decision] = []

    threads = [threading.Thread(target=lambda: results.append(runner.decide("x", YES_NO, "nudity"))) for _ in range(2)]
    for thread in threads:
        thread.start()
    deadline = time.monotonic() + 5
    while runner._waiting < 2:  # both tasks queued before the first one finishes
        assert time.monotonic() < deadline
        time.sleep(0.005)
    gate.set()
    for thread in threads:
        thread.join(timeout=5)
    settle(runner)

    assert len(results) == 2 and len({result.trace_id for result in results}) == 2
    assert loads.count == 1 and not runner.loaded()


def test_a_preload_waits_for_its_task_then_unloads(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(decision_model.threading, "Timer", FakeTimer)
    FakeTimer.made = []
    loads = Loads()
    runner = LayaRunner(loads)

    runner.preload()
    settle(runner)
    assert runner.loaded() and FakeTimer.made[-1].seconds == decision_model.PRELOAD_GRACE_SECONDS
    runner.decide("x", YES_NO, "nudity")
    settle(runner)

    assert loads.count == 1 and not runner.loaded()
    assert FakeTimer.made[0].cancelled


def test_a_preload_nothing_follows_unloads_after_its_grace(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(decision_model.threading, "Timer", FakeTimer)
    FakeTimer.made = []
    runner = LayaRunner(Loads())
    runner.preload()
    settle(runner)
    FakeTimer.made[-1].callback()
    settle(runner)
    assert not runner.loaded()


def test_a_failed_load_raises_with_the_trace_id_and_is_logged(caplog: pytest.LogCaptureFixture) -> None:
    runner = LayaRunner(Loads(error=OSError("disk")))
    with pytest.raises(DecisionError) as raised:
        runner.decide("x", YES_NO, "nudity")
    assert raised.value.reason == "OSError"
    assert f"[{raised.value.trace_id}] Laya could not load (OSError)" in caplog.text


def test_choice_and_score_answers_keep_their_probabilities() -> None:
    runner = LayaRunner(Loads())
    questions = {
        "kind": {"type": "choice", "instructions": "Kind?", "criteria": {"animal": "animals", "place": "places"}},
        "calm": {"type": "score", "instructions": "Calm?", "criteria": ["tense", "calm"]},
    }
    answers = runner.decide("x", questions, "free").answers
    assert answers["kind"] == {"choice": "animal", "probabilities": {"animal": 0.5, "place": 0.5}}
    assert answers["calm"] == {"score": 1.5, "probabilities": {"tense": 0.5, "calm": 0.5}}


def test_the_nudity_task_refuses_at_its_threshold_and_its_version_follows_its_definition() -> None:
    def decision(probability: float) -> Decision:
        return Decision(trace_id="t", answers={"nudity": {"probability": probability}}, decide_ms=1)

    assert not NUDITY.refuses(decision(0.51))
    assert NUDITY.refuses(decision(0.52))
    assert len(NUDITY.version) == 12


def test_the_nudity_threshold_comes_from_the_environment(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    def decision(probability: float) -> Decision:
        return Decision(trace_id="t", answers={"nudity": {"probability": probability}}, decide_ms=1)

    default_version = NUDITY.version
    monkeypatch.setenv("DECISION_NUDITY_REFUSE_AT", "0.4")
    assert NUDITY.refuses(decision(0.45))
    assert NUDITY.version != default_version
    monkeypatch.setenv("DECISION_NUDITY_REFUSE_AT", "1.5")
    assert not NUDITY.refuses(decision(0.51))
    assert NUDITY.version == default_version
    assert "DECISION_NUDITY_REFUSE_AT='1.5' is not a number above 0 and at most 1; using 0.52." in caplog.text


def test_the_switch_and_the_numbers_come_from_the_environment(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    assert decision_model.enabled()
    monkeypatch.setenv("DECISION_MODEL", " OFF ")
    assert not decision_model.enabled()
    monkeypatch.setenv("DECISION_KEEP_ALIVE", "soon")
    assert decision_model.env_number("DECISION_KEEP_ALIVE", 0) == 0
    assert "DECISION_KEEP_ALIVE='soon' is not a whole number; using 0." in caplog.text


FAKE_WORKER = """
import json, sys
mode = sys.argv[1]
if mode == "dies":
    sys.exit(3)
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    if mode == "fails":
        print(json.dumps({"error": "ValueError"}), flush=True)
    else:
        print(json.dumps({"answers": {"nudity": {"type": "noul", "noul": len(request["text"]) / 100}}}), flush=True)
"""


def fake_worker(tmp_path: Path, mode: str) -> list[str]:
    script = tmp_path / "worker.py"
    script.write_text(FAKE_WORKER)
    return [sys.executable, str(script), mode]


def test_laya_in_its_process_answers_each_request_and_ends_when_closed(tmp_path: Path) -> None:
    laya = decision_model.ProcessLaya(fake_worker(tmp_path, "answers"))
    assert laya.predict("a fox in the snow", YES_NO) == {"answers": {"nudity": {"type": "noul", "noul": 0.17}}}
    assert laya.predict("x", YES_NO)["answers"]["nudity"]["noul"] == 0.01  # type: ignore[index]
    laya.close()
    assert laya._process.poll() == 0


def test_an_error_or_a_dead_process_is_raised(tmp_path: Path) -> None:
    failing = decision_model.ProcessLaya(fake_worker(tmp_path, "fails"))
    with pytest.raises(RuntimeError, match="could not answer"):
        failing.predict("x", YES_NO)
    failing.close()
    with pytest.raises(RuntimeError, match="ended"):
        decision_model.ProcessLaya(fake_worker(tmp_path, "dies"))


def test_the_real_worker_is_started_with_the_checkpoint_and_threads(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DECISION_THREADS", "4")
    command = decision_model.worker_command()
    assert command[1].endswith("laya_worker.py") and command[2:] == [str(decision_model.LAYA_PATH), "4"]
