"""The agent's three ways into the local anet service: as the program the
site bound this account to (decide, read explanations), as the engineer
(task settings, loading tasks) and as the operator (the person's confirm
or dismiss). Each has its own connection, so they never wait on each other."""

from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Any, Iterator

import anet

from .settings import Settings

OBJECT_TASK = "object-detection"
SENSOR_TASK = "sensor-pattern"
EXPLANATION_MODEL = "qwen3-4b"

# The detector's 80 class names, in its output order, from the model's own
# metadata (YOLO11n trained on COCO), as anet's release ships them.
COCO_LABELS = (
    "person bicycle car motorcycle airplane bus train truck boat traffic-light fire-hydrant "
    "stop-sign parking-meter bench bird cat dog horse sheep cow elephant bear zebra giraffe "
    "backpack umbrella handbag tie suitcase frisbee skis snowboard sports-ball kite "
    "baseball-bat baseball-glove skateboard surfboard tennis-racket bottle wine-glass cup fork "
    "knife spoon bowl banana apple sandwich orange broccoli carrot hot-dog pizza donut cake "
    "chair couch potted-plant bed dining-table toilet tv laptop mouse remote keyboard "
    "cell-phone microwave oven toaster sink refrigerator book clock vase scissors teddy-bear "
    "hair-drier toothbrush"
).split()
# The people and dangerous objects this detector knows. It knows no fire or
# smoke; those need a detector trained on them (specs/0075, Scope).
TRACKED_LABELS = ["person", "knife", "scissors"]

OBJECT_TASK_SETTINGS = {
    # Every frame is detected, so every frame is advice: a threshold above
    # zero would queue an explanation per unsure frame, fifteen a second,
    # and anet's explanation queue has no bound yet (TODO.md).
    "threshold": 0.0,
    "model_allowance_bytes": 512 << 20,
    "device": "cpu",
    "config": {
        "input_name": "images",
        "output_name": "output0",
        "input_side": 640,
        "labels": COCO_LABELS,
        "tracked_labels": TRACKED_LABELS,
        "min_score": 0.35,
        "overlap_limit": 0.7,
        "max_pixels": 8_294_400,
    },
}


def sensor_task_settings(references: dict[str, list[float]]) -> dict[str, Any]:
    """Each sensor's own reference series (specs/0078, MORE-2)."""
    return {
        "threshold": 0.3,
        "model_allowance_bytes": 256 << 20,
        "device": "cpu",
        "config": {
            "floors": [
                {"sensor": sensor, "reference": reference, "scale": 1.0}
                for sensor, reference in sorted(references.items())
            ],
            "bands": {"medium": 2.0, "high": 5.0},
            "modes": {"forecast": True, "time": True, "frequency": False},
        },
    }


class AnetSite:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.program = anet.connect(settings.anet_socket)
        self.explainer_reader = anet.connect(settings.anet_socket)
        self._operator_lock = threading.Lock()
        self._engineer_lock = threading.Lock()
        self._references_lock = threading.Lock()
        self._sensor_references: dict[str, list[float]] = {}

    @contextmanager
    def _person(self, name: str, password: str) -> Iterator[anet.Client]:
        """A person's session for one rare action. A person's session ends
        after the site's idle time, so none is held between actions."""
        client = anet.connect(self.settings.anet_socket)
        try:
            client.login(name, password)
            yield client
            client.logout()
        finally:
            client.close()

    def _write_task_settings(self, engineer: anet.Client, task: str, task_settings: dict[str, Any]) -> None:
        current = engineer.http.get("/v1/settings")
        current.raise_for_status()
        site_settings = current.json()
        site_settings["serve"]["explanation_model"] = EXPLANATION_MODEL
        site_settings["tasks"][task] = task_settings
        written = engineer.http.put("/v1/settings", json=site_settings)
        if written.status_code >= 400:
            raise RuntimeError(f"the site settings were refused: {written.text}")

    def _prepare(self, task: str, task_settings: dict[str, Any]) -> None:
        with self._engineer_lock, self._person(
            self.settings.engineer, self.settings.engineer_password
        ) as engineer:
            self._write_task_settings(engineer, task, task_settings)
            loaded = {item["name"]: item["loaded"] for item in engineer.tasks()}
            if loaded.get(task):
                engineer.unload_task(task)
            engineer.load_task(task)

    def prepare_object_task(self) -> None:
        self._prepare(OBJECT_TASK, OBJECT_TASK_SETTINGS)

    def add_sensor_reference(self, sensor: str, reference: list[float]) -> None:
        """The sensor's own readings while it ran as usual; the task judges
        its later windows against their noise. The settings carry every
        sensor's reference taken so far, so adding one keeps the others."""
        # Held across the write, so two sensors whose references fill at
        # once cannot each write the settings without the other's.
        with self._references_lock:
            references = {**self._sensor_references, sensor: reference}
            self._prepare(SENSOR_TASK, sensor_task_settings(references))
            self._sensor_references = references

    def decide(self, task: str, case: dict[str, Any]) -> anet.Decision:
        return self.program.decide(task, case)

    def explanation(self, task: str, decision_id: str) -> anet.Explanation:
        return self.explainer_reader.explanation(task, decision_id)

    def act(self, task: str, decision_id: str, action: str) -> None:
        with self._operator_lock, self._person(
            self.settings.operator, self.settings.operator_password
        ) as operator:
            operator.act(task, decision_id, action)
