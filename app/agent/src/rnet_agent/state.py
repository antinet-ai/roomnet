"""What the screen reads: the latest value and the latest failure of each
source, and the decisions, kept in memory and guarded by one lock."""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

MAX_DECISIONS_KEPT = 200
# Readings kept per sensor for its chart: ten minutes of the plug at one a
# second, or about two and a half hours of a hub sensor at one per 16 s.
HISTORY_LENGTH = 600
TIMELINE_LENGTH = 200


def now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class SourceState:
    """One source's last good value with its time, and the last failure,
    cleared by the next success."""

    value: Any = None
    value_time: datetime | None = None
    error: str | None = None
    error_time: datetime | None = None

    def succeeded(self, value: Any) -> None:
        self.value = value
        self.value_time = now()
        self.error = None
        self.error_time = None

    def failed(self, error: str) -> None:
        self.error = error
        self.error_time = now()

    def as_json(self) -> dict[str, Any]:
        return {
            "value": self.value,
            "value_time": self.value_time.isoformat() if self.value_time else None,
            "error": self.error,
            "error_time": self.error_time.isoformat() if self.error_time else None,
        }


@dataclass
class SeriesState:
    """One judged sensor: its latest reading, its standing with anet (the
    reference being taken, or the latest decision) and its recent readings."""

    label: str
    unit: str
    reading: SourceState = field(default_factory=SourceState)
    judge: SourceState = field(default_factory=SourceState)
    history: deque[tuple[str, float]] = field(default_factory=lambda: deque(maxlen=HISTORY_LENGTH))

    def as_json(self) -> dict[str, Any]:
        return {
            "label": self.label,
            "unit": self.unit,
            "reading": self.reading.as_json(),
            "judge": self.judge.as_json(),
            "history": list(self.history),
        }


@dataclass
class HomeState:
    lock: threading.Lock = field(default_factory=threading.Lock)
    camera: SourceState = field(default_factory=SourceState)
    detection: SourceState = field(default_factory=SourceState)
    plug: SourceState = field(default_factory=SourceState)
    hub: SourceState = field(default_factory=SourceState)
    door: SourceState = field(default_factory=SourceState)
    motion: SourceState = field(default_factory=SourceState)
    climate: SourceState = field(default_factory=SourceState)
    bulb: SourceState = field(default_factory=SourceState)
    climate_record: SourceState = field(default_factory=SourceState)
    # Off until a person switches it on (specs/0078, MORE-17).
    door_lights_off: dict[str, Any] = field(
        default_factory=lambda: {"enabled": False, "last_run": None, "error": None}
    )
    # The watch (watch.py): whether its API listens, and the last request
    # that carried the token.
    watch: dict[str, Any] = field(
        default_factory=lambda: {"enabled": False, "port": None, "last_seen": None, "address": None}
    )
    series: dict[str, SeriesState] = field(default_factory=dict)
    # What happened in the home, from every source (specs/0078, MORE-14),
    # each with a key so an event read twice from a device's log is kept once.
    timeline: deque[dict[str, Any]] = field(default_factory=lambda: deque(maxlen=TIMELINE_LENGTH))
    timeline_keys: set[str] = field(default_factory=set)
    frame_jpeg: bytes | None = None
    frame_time: datetime | None = None
    frame_size: tuple[int, int] | None = None
    # Counted up on every new frame and every new detection, and announced
    # on `updates`, so the stream, the detector and the screen wake on the
    # change instead of polling.
    frame_sequence: int = 0
    detection_sequence: int = 0
    updates: threading.Condition = field(default_factory=threading.Condition)
    decisions: deque[dict[str, Any]] = field(default_factory=lambda: deque(maxlen=MAX_DECISIONS_KEPT))

    def announce(self) -> None:
        with self.updates:
            self.updates.notify_all()

    def wait_for_change(self, seen: tuple[int, int], timeout: float) -> tuple[int, int]:
        """Blocks until the frame or detection sequence differs from `seen`,
        or the timeout passes; returns the sequences then."""
        with self.updates:
            self.updates.wait_for(
                lambda: (self.frame_sequence, self.detection_sequence) != seen, timeout=timeout
            )
            return self.frame_sequence, self.detection_sequence

    def add_decision(self, decision: dict[str, Any]) -> None:
        with self.lock:
            self.decisions.appendleft(decision)

    def find_decision(self, decision_id: str) -> dict[str, Any] | None:
        with self.lock:
            return next((item for item in self.decisions if item["id"] == decision_id), None)

    def add_to_timeline(self, key: str, time: str, source: str, text: str, decision_id: str | None = None) -> None:
        """Called with `lock` held."""
        if key in self.timeline_keys:
            return
        # A full deque refuses `insert`, so the oldest entry goes first.
        if len(self.timeline) == self.timeline.maxlen:
            self.timeline_keys.discard(self.timeline.pop()["key"])
        self.timeline_keys.add(key)
        entry = {"key": key, "time": time, "source": source, "text": text, "decision_id": decision_id}
        # Device logs arrive late and out of order; the newest stays first.
        position = next((index for index, item in enumerate(self.timeline) if item["time"] < time), len(self.timeline))
        self.timeline.insert(position, entry)
