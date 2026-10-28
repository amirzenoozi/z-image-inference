import threading
from collections.abc import Iterator
from concurrent.futures import Future, ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from PIL import Image

import model_server

WAI = "wai-illustrious"
JOB = "11111111-2222-4333-8444-555555555555"
OTHER_JOB = "66666666-7777-4888-9999-000000000000"


class SteppingGenerator:
    """Stands in for a model: reports each step, waiting for the test to allow it."""

    def __init__(self) -> None:
        self.allowed = threading.Semaphore(0)
        self.started = threading.Event()
        self.runs = 0

    def __call__(self, job: model_server.Job, progress: model_server.JobProgress) -> Image.Image:
        self.runs += 1
        progress.enter("generating")
        self.started.set()
        for step in range(1, job.steps + 1):
            self.allowed.acquire(timeout=5)
            progress.step_done(step)
        return Image.new("RGB", (8, 8))


@pytest.fixture
def generator(monkeypatch: pytest.MonkeyPatch) -> Iterator[SteppingGenerator]:
    fake = SteppingGenerator()
    monkeypatch.setattr(model_server, "model_status", lambda model_id: "ready")
    monkeypatch.setattr(model_server, "LOADERS", {**model_server.LOADERS, WAI: lambda: fake})
    monkeypatch.setattr(model_server, "loaded_model_id", None)
    monkeypatch.setattr(model_server, "loaded_generator", None)
    monkeypatch.setattr(model_server, "release_memory", lambda: None)
    monkeypatch.setattr(model_server, "jobs", {})
    yield fake
    for _ in range(50):
        fake.allowed.release()


def request(job_id: str, steps: int = 3) -> dict[str, object]:
    return {"model": WAI, "prompt": "a cat", "width": 1024, "height": 1024, "steps": steps, "job_id": job_id}


def start(pool: ThreadPoolExecutor, client: TestClient, job_id: str, steps: int = 3) -> "Future[object]":
    return pool.submit(client.post, "/generate", json=request(job_id, steps))


def wait_for_step(client: TestClient, job_id: str, step: int) -> dict[str, object]:
    for _ in range(500):
        state = client.get(f"/jobs/{job_id}").json()
        if state.get("step") == step:
            return state
        threading.Event().wait(0.01)
    raise AssertionError(f"job never reached step {step}")


def test_progress_follows_each_step_then_the_job_is_gone(generator: SteppingGenerator) -> None:
    client = TestClient(model_server.app)
    with ThreadPoolExecutor() as pool:
        result = start(pool, client, JOB)
        generator.started.wait(timeout=5)
        assert client.get(f"/jobs/{JOB}").json() == {"phase": "generating", "step": 0, "total": 3}

        generator.allowed.release()
        assert wait_for_step(client, JOB, 1) == {"phase": "generating", "step": 1, "total": 3}

        generator.allowed.release(2)
        resp = result.result(timeout=5)
        assert resp.status_code == 200
        assert isinstance(resp.json()["seconds"], float)

    assert client.get(f"/jobs/{JOB}").status_code == 404


def test_cancelling_stops_the_job_at_the_next_step(generator: SteppingGenerator) -> None:
    client = TestClient(model_server.app)
    with ThreadPoolExecutor() as pool:
        result = start(pool, client, JOB, steps=9)
        generator.started.wait(timeout=5)

        assert client.post(f"/jobs/{JOB}/cancel").status_code == 204
        generator.allowed.release()
        resp = result.result(timeout=5)

    assert resp.status_code == 409
    assert resp.json()["detail"] == "Cancelled"
    assert client.get(f"/jobs/{JOB}").status_code == 404


def test_a_job_cancelled_while_waiting_never_runs(generator: SteppingGenerator) -> None:
    client = TestClient(model_server.app)
    with ThreadPoolExecutor() as pool:
        first = start(pool, client, JOB, steps=1)
        generator.started.wait(timeout=5)
        second = start(pool, client, OTHER_JOB, steps=1)
        for _ in range(500):
            if client.get(f"/jobs/{OTHER_JOB}").status_code == 200:
                break
            threading.Event().wait(0.01)
        assert client.get(f"/jobs/{OTHER_JOB}").json()["phase"] == "waiting"

        client.post(f"/jobs/{OTHER_JOB}/cancel")
        generator.allowed.release()

        assert first.result(timeout=5).status_code == 200
        assert second.result(timeout=5).status_code == 409
    assert generator.runs == 1


def test_unknown_jobs_are_not_found(generator: SteppingGenerator) -> None:
    client = TestClient(model_server.app)
    assert client.get(f"/jobs/{JOB}").status_code == 404
    assert client.post(f"/jobs/{JOB}/cancel").status_code == 404


def test_a_job_id_must_be_a_uuid(generator: SteppingGenerator) -> None:
    client = TestClient(model_server.app)
    assert client.post("/generate", json=request("../models")).status_code == 422
