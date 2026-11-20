"""Which decisions the screen lists, and their explanations. Every decision
is in anet's records already; the screen lists every one sent to a person
and, of the advice, only a change of answer, so a steady scene or a steady
load does not bury the ones that need a tap."""

from __future__ import annotations

import threading
from datetime import datetime
from typing import Any

import anet

from .anet_site import AnetSite
from .controls import actions_for
from .state import HomeState

MAX_FRAMES_KEPT = 200
# A detector unsure of a person flips between "person" and "nothing" many
# times a second; the timeline names each kind it saw once a minute at most.
CAMERA_TIMELINE_GAP_SECONDS = 60.0
_last_camera_entry: dict[str, float] = {}
_last_advice_label: dict[str, str] = {}
_frames: dict[str, bytes] = {}
_frames_lock = threading.Lock()


def frame_for(decision_id: str) -> bytes | None:
    with _frames_lock:
        return _frames.get(decision_id)


def _keep_frame(decision_id: str, frame: bytes) -> None:
    with _frames_lock:
        _frames[decision_id] = frame
        while len(_frames) > MAX_FRAMES_KEPT:
            _frames.pop(next(iter(_frames)))


def record_decision(
    state: HomeState,
    site: AnetSite,
    decision: anet.Decision,
    *,
    source: str,
    frame: bytes | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    if not decision.to_person:
        if _last_advice_label.get(source) == decision.label:
            return
        _last_advice_label[source] = decision.label
    entry: dict[str, Any] = {
        "id": decision.id,
        "task": decision.task,
        "source": source,
        "time": decision.time,
        "label": decision.label,
        "attributes": decision.attributes or {},
        "confidence": decision.confidence,
        "threshold": decision.threshold,
        "to_person": decision.to_person,
        "model_version": decision.model_version,
        "model_digest": decision.model_digest,
        "detail": detail or {},
        "explanation": None,
        "explanation_error": None,
        "action": None,
        "action_error": None,
        "has_frame": frame is not None,
        # The device actions a person may take from this decision's card,
        # and those taken (specs/0078, MORE-15).
        "device_actions": actions_for(source),
        "device_actions_taken": [],
    }
    if frame is not None:
        _keep_frame(decision.id, frame)
    state.add_decision(entry)
    _add_to_timeline(state, entry)
    if decision.to_person:
        threading.Thread(
            target=_read_explanation,
            args=(state, site, decision.task, decision.id),
            name=f"explanation-{decision.id}",
            daemon=True,
        ).start()


def _read_explanation(state: HomeState, site: AnetSite, task: str, decision_id: str) -> None:
    try:
        explanation = site.explanation(task, decision_id)
    except Exception as error:  # noqa: BLE001 - shown on the decision, never hidden
        text, failure = None, f"The explanation could not be read: {error}"
    else:
        text, failure = explanation.text, explanation.error
    entry = state.find_decision(decision_id)
    if entry is None:
        return
    with state.lock:
        entry["explanation"] = text
        entry["explanation_error"] = failure


def _add_to_timeline(state: HomeState, entry: dict[str, Any]) -> None:
    """A camera decision that saw a tracked kind, and a sensor decision sent
    to a person, go on the home's timeline (MORE-14)."""
    percent = f"{round(entry['confidence'] * 100)}%"
    if entry["source"] == "camera":
        if entry["label"] == "nothing":
            return
        moment = datetime.fromisoformat(entry["time"]).timestamp()
        if moment - _last_camera_entry.get(entry["label"], float("-inf")) < CAMERA_TIMELINE_GAP_SECONDS:
            return
        _last_camera_entry[entry["label"]] = moment
        seen = entry["attributes"].get("objects", entry["label"]).replace(":", " ").replace(",", ", ")
        text = f"Camera saw {seen.replace('-', ' ')} · {percent}"
    elif entry["to_person"]:
        changed = "changed" if entry["label"] == "real" else "as usual"
        text = f"{entry['source']} pattern {changed} · {percent}, sent to you"
    else:
        return
    with state.lock:
        state.add_to_timeline(f"decision-{entry['id']}", entry["time"], entry["source"], text, entry["id"])
