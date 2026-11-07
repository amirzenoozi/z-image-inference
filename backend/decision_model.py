"""Laya, a small decision model: it answers typed questions about a text (yes/no, a choice, a score) instead of writing.

It runs on the CPU, leaving the GPU to the image models, in a child process (laya_worker.py) and only while there is
work: it starts for a task and ends after it, or DECISION_KEEP_ALIVE seconds after the last one. Ending the process
gives all its memory back, which unloading inside the web app could not. Every task has a trace id, in each of its log
lines and in what it returns; the text it is given is never logged.
"""

import gc
import logging
import json
import os
import select
import subprocess
import sys
import threading
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Protocol

from huggingface_hub import snapshot_download

from paths import MODELS_DIR

log = logging.getLogger("decision")

LAYA_REPO = "convaiinnovations/laya"
LAYA_PATH = MODELS_DIR / "laya"
# The English checkpoint at the repo's root only; the repo also holds two others
LAYA_FILES = ["rl_agent_config.json", "model.safetensors", "tokenizer/*", "encoder/*"]
DEFAULT_THREADS = 8
WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "laya_worker.py")
# Starting Python, importing torch and loading take about 2 seconds; a first start after a reboot can be slower
LOAD_TIMEOUT_SECONDS = 120
DECIDE_TIMEOUT_SECONDS = 30
# A preload keeps Laya at least this long for the task it was made for, even with no keep-alive
PRELOAD_GRACE_SECONDS = 10

Questions = dict[str, dict[str, object]]
Answer = dict[str, object]


class DecisionError(Exception):
    """Laya could not load or answer; the reason is logged with the task's trace id, which it carries."""

    def __init__(self, reason: str, trace_id: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.trace_id = trace_id


@dataclass(frozen=True)
class Decision:
    trace_id: str
    # Per question: "probability" (yes/no), "choice" or "score" with "probabilities"
    answers: dict[str, Answer]
    decide_ms: int


class LayaAgent(Protocol):
    def predict(self, state: str, questions: Questions) -> dict[str, object]: ...

    def close(self) -> None: ...


def enabled() -> bool:
    """DECISION_MODEL=off turns Laya off: the checks that use it are skipped and the free endpoint answers 503."""
    return os.environ.get("DECISION_MODEL", "on").strip().lower() != "off"


def env_number(name: str, default: int) -> int:
    value = os.environ.get(name, "").strip()
    if not value:
        return default
    if value.isdigit():
        return int(value)
    log.warning("%s=%r is not a whole number; using %d.", name, value, default)
    return default


def download_marker() -> str:
    return str(LAYA_PATH / ".download-complete")


class ProcessLaya:
    """Laya in a child process: requests and answers are JSON lines over its stdin and stdout; close() ends it."""

    def __init__(self, command: list[str]) -> None:
        self._process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        try:
            self._reply(LOAD_TIMEOUT_SECONDS)
        except Exception:
            self.close()
            raise

    def predict(self, state: str, questions: Questions) -> dict[str, object]:
        assert self._process.stdin is not None
        self._process.stdin.write(json.dumps({"text": state, "questions": questions}) + "\n")
        self._process.stdin.flush()
        reply = self._reply(DECIDE_TIMEOUT_SECONDS)
        if "error" in reply:
            raise RuntimeError(f"Laya's process could not answer ({reply['error']})")
        return {"answers": reply["answers"]}

    def _reply(self, timeout: float) -> dict[str, object]:
        output = self._process.stdout
        assert output is not None
        ready, _, _ = select.select([output], [], [], timeout)
        line = output.readline() if ready else ""
        if not ready:
            raise TimeoutError(f"Laya's process did not answer within {timeout:.0f}s")
        if not line:
            raise RuntimeError(f"Laya's process ended (exit code {self._process.poll()})")
        reply: dict[str, object] = json.loads(line)
        return reply

    def close(self) -> None:
        """Ends the process: closing its input lets it exit; one that doesn't is killed."""
        if self._process.stdin is not None:
            self._process.stdin.close()
        try:
            self._process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._process.kill()
            self._process.wait()


def worker_command() -> list[str]:
    return [sys.executable, WORKER, str(LAYA_PATH), str(env_number("DECISION_THREADS", DEFAULT_THREADS))]


def load_laya() -> LayaAgent:
    """Downloads the checkpoint once into models/laya/, then starts Laya's process, which loads it on the CPU."""
    if not os.path.exists(download_marker()):
        log.info("Downloading Laya (%s) to %s...", LAYA_REPO, LAYA_PATH)
        snapshot_download(LAYA_REPO, local_dir=LAYA_PATH, allow_patterns=LAYA_FILES)
        open(download_marker(), "w").close()
    return ProcessLaya(worker_command())


def answer_of(raw: dict[str, object]) -> Answer:
    """Laya's answer reduced to what callers use: the yes probability, or the choice or score with its probabilities."""
    kind = raw.get("type")
    if kind == "noul":
        return {"probability": float(raw["noul"])}  # type: ignore[arg-type]
    key = "choice" if kind == "choice" else "score"
    return {key: raw[key], "probabilities": raw.get("probabilities", {})}


def summary(answers: dict[str, Answer]) -> str:
    """For the log: each question's main value, never the text or the labels' wording beyond the chosen one."""
    return ", ".join(f"{name} {next(iter(answer.values()))}" for name, answer in answers.items())


class LayaRunner:
    """
    One Laya at most, on one worker thread, so tasks queue instead of loading twice. After a task it unloads at once
    (DECISION_KEEP_ALIVE=0, the default) or once nothing has asked for that many seconds; a task already waiting
    shares the loaded model.
    """

    def __init__(self, loader: Callable[[], LayaAgent] | None = None) -> None:
        self._loader = loader
        self._agent: LayaAgent | None = None
        self._worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="laya")
        self._lock = threading.Lock()
        self._waiting = 0
        self._unload_timer: threading.Timer | None = None

    def decide(self, text: str, questions: Questions, label: str) -> Decision:
        """Answers the questions about the text; `label` names the task in the log. Raises DecisionError."""
        trace_id = str(uuid.uuid4())
        with self._lock:
            self._waiting += 1
        return self._worker.submit(self._run, trace_id, text, questions, label).result()

    def preload(self) -> None:
        """Starts loading now, for a task about to come, so the load overlaps the caller's own work."""
        with self._lock:
            self._waiting += 1
        self._worker.submit(self._preload)

    def _preload(self) -> None:
        try:
            self._ensure_loaded("preload")
        except DecisionError:
            pass  # Logged; the task that follows tries again and reports it
        finally:
            self._done(minimum_keep_alive=PRELOAD_GRACE_SECONDS)

    def _run(self, trace_id: str, text: str, questions: Questions, label: str) -> Decision:
        try:
            agent = self._ensure_loaded(trace_id)
            started = time.perf_counter()
            raw = agent.predict(text, questions)["answers"]
            answers = {name: answer_of(raw[name]) for name in questions}  # type: ignore[index]
            decide_ms = round((time.perf_counter() - started) * 1000)
            log.info("[%s] %s: %s (%d ms)", trace_id, label, summary(answers), decide_ms)
        except DecisionError:
            raise
        except Exception as error:
            log.exception("[%s] %s: Laya could not answer (%s)", trace_id, label, type(error).__name__)
            raise DecisionError(type(error).__name__, trace_id) from error
        finally:
            self._done()
        return Decision(trace_id=trace_id, answers=answers, decide_ms=decide_ms)

    def _ensure_loaded(self, trace_id: str) -> LayaAgent:
        self._cancel_unload()
        if self._agent is None:
            started = time.perf_counter()
            try:
                self._agent = (self._loader or load_laya)()
            except Exception as error:
                log.exception("[%s] Laya could not load (%s)", trace_id, type(error).__name__)
                raise DecisionError(type(error).__name__, trace_id) from error
            log.info("[%s] Laya loaded in %.1fs", trace_id, time.perf_counter() - started)
        return self._agent

    def _done(self, minimum_keep_alive: int = 0) -> None:
        """After each piece of work, on the worker: unload once nothing else is waiting, now or after the keep-alive."""
        with self._lock:
            self._waiting -= 1
            if self._waiting > 0:
                return
        keep_alive = max(env_number("DECISION_KEEP_ALIVE", 0), minimum_keep_alive)
        if keep_alive == 0:
            self._unload()
            return
        self._unload_timer = threading.Timer(keep_alive, lambda: self._worker.submit(self._unload_if_idle))
        self._unload_timer.daemon = True
        self._unload_timer.start()

    def _cancel_unload(self) -> None:
        if self._unload_timer is not None:
            self._unload_timer.cancel()
            self._unload_timer = None

    def _unload_if_idle(self) -> None:
        with self._lock:
            idle = self._waiting == 0
        if idle:
            self._unload()

    def _unload(self) -> None:
        if self._agent is None:
            return
        agent, self._agent = self._agent, None
        try:
            agent.close()
        except Exception as error:  # Unloading is best effort; the next task starts a fresh process
            log.warning("Laya did not close cleanly (%s)", type(error).__name__)
        gc.collect()
        log.info("Laya unloaded")

    def loaded(self) -> bool:
        return self._agent is not None


runner = LayaRunner()
