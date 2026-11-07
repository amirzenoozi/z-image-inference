"""The tasks Laya does for the app: each is the questions it asks and, in code, what the answers decide.

Add a task here and call it where it is needed. Each threshold is read from .env (listed in .env.example), and
`version` tells a task's saved results apart after its questions or a threshold change.
"""

import hashlib
import json
import logging
import os
from dataclasses import dataclass

from decision_model import Decision, Questions

log = logging.getLogger("decision")


@dataclass(frozen=True)
class Threshold:
    """A probability from 0 to 1, set by an .env variable; a missing or invalid value uses the default."""

    env: str
    default: float

    def value(self) -> float:
        text = os.environ.get(self.env, "").strip()
        if not text:
            return self.default
        try:
            number = float(text)
        except ValueError:
            number = -1.0
        if 0 < number <= 1:
            return number
        log.warning("%s=%r is not a number above 0 and at most 1; using %s.", self.env, text, self.default)
        return self.default


@dataclass(frozen=True)
class Task:
    name: str
    questions: Questions
    # Refused when any yes/no question's probability reaches its threshold
    refuse_at: dict[str, Threshold]

    @property
    def version(self) -> str:
        limits = {name: threshold.value() for name, threshold in self.refuse_at.items()}
        definition = json.dumps({"questions": self.questions, "refuse_at": limits}, sort_keys=True)
        return hashlib.sha256(definition.encode()).hexdigest()[:12]

    def refuses(self, decision: Decision) -> bool:
        return any(float(decision.answers[name]["probability"]) >= threshold.value() for name, threshold in self.refuse_at.items())  # type: ignore[arg-type]


# A chat question while adult content is locked. Zero-shot, Laya scores clothed scenes up to about 0.5 and nude ones
# from about 0.52 with this wording, so the default sits between them; label saved results to calibrate it.
NUDITY = Task(
    name="nudity",
    questions={
        "nudity": {
            "type": "noul",
            "instructions": "Would the image show bare breasts, genitals or a sexual act?",
            "criteria": {
                "true": "the person is naked, topless, undressed or in a sexual act",
                "false": "everyone in it is dressed, or there are no people",
            },
        },
    },
    refuse_at={"nudity": Threshold(env="DECISION_NUDITY_REFUSE_AT", default=0.52)},
)
