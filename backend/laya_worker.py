"""Runs Laya in its own process for decision_model.py, so unloading ends the process and all its memory goes back.

Usage: laya_worker.py <checkpoint folder> <cpu threads>. Loads the checkpoint on the CPU, writes {"ready": true}, then
answers one JSON request per line on stdin ({"text", "questions"}) with one JSON line on stdout ({"answers"} or
{"error"}). It exits when stdin closes. Anything a library prints goes to stderr, so it never breaks the protocol.
"""

import json
import os
import sys
from typing import IO


def send(protocol: IO[str], message: dict[str, object]) -> None:
    # numpy and torch numbers become plain floats
    protocol.write(json.dumps(message, default=lambda value: value.item() if hasattr(value, "item") else str(value)) + "\n")
    protocol.flush()


def main() -> None:
    path, threads = sys.argv[1], int(sys.argv[2])
    protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    os.environ.setdefault("USE_TF", "0")
    import torch

    import laya

    torch.set_num_threads(threads)
    agent = laya.load(path, device="cpu")
    send(protocol, {"ready": True})
    for line in sys.stdin:
        request = json.loads(line)
        try:
            send(protocol, {"answers": agent.predict(request["text"], request["questions"])["answers"]})
        except Exception as error:  # Reported to the web app, which logs it with the task's trace id
            send(protocol, {"error": type(error).__name__})


if __name__ == "__main__":
    main()
