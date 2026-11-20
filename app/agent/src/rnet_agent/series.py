"""One sensor's readings judged by anet's sensor-pattern task: the first
full window, taken while the sensor runs as usual, becomes that sensor's
own reference, and from then on a window goes to anet every few readings
(specs/0075 HOME-4 and HOME-5, specs/0078 MORE-2 and MORE-4)."""

from __future__ import annotations

from datetime import datetime

from .anet_site import SENSOR_TASK, AnetSite
from .decisions import record_decision
from .state import HomeState, SeriesState

WINDOW_LENGTH = 513
# After a failed reference setup, readings to wait before trying again.
SETUP_RETRY_READINGS = 30


class SeriesJudge:
    def __init__(
        self,
        sensor: str,
        label: str,
        unit: str,
        decide_every: int,
        state: HomeState,
        site: AnetSite,
    ):
        self.sensor = sensor
        self._decide_every = decide_every
        self._state = state
        self._site = site
        self._samples: list[float] = []
        self._reference_ready = False
        self._since_decision = 0
        self._readings_until_setup = 0
        with state.lock:
            state.series[sensor] = SeriesState(label=label, unit=unit)

    def _series(self) -> SeriesState:
        return self._state.series[self.sensor]

    def failed(self, error: str) -> None:
        with self._state.lock:
            self._series().reading.failed(error)

    def add(self, value: float, sample_time: datetime, detail: dict | None = None) -> None:
        """One reading. Blocks while anet sets up the reference or decides,
        so it is called from the device's worker, never its event loop."""
        with self._state.lock:
            series = self._series()
            series.reading.succeeded({"value": value, **(detail or {})})
            series.history.append((sample_time.isoformat(), value))
        self._samples.append(value)
        if len(self._samples) > WINDOW_LENGTH:
            self._samples = self._samples[-WINDOW_LENGTH:]
        if not self._reference_ready:
            self._take_reference()
            if not self._reference_ready:
                return
            self._since_decision = self._decide_every
        self._since_decision += 1
        if self._since_decision < self._decide_every:
            return
        self._since_decision = 0
        self._decide(sample_time)

    def _take_reference(self) -> None:
        held = len(self._samples)
        with self._state.lock:
            self._series().judge.succeeded({"phase": "reference", "held": held, "needed": WINDOW_LENGTH})
        if held < WINDOW_LENGTH:
            return
        if len(set(self._samples)) < 2:
            with self._state.lock:
                self._series().judge.failed(
                    "The reading did not change at all while the reference was taken; "
                    "the reference starts again."
                )
            self._samples.clear()
            return
        if self._readings_until_setup > 0:
            self._readings_until_setup -= 1
            return
        try:
            self._site.add_sensor_reference(self.sensor, list(self._samples))
        except Exception as error:  # noqa: BLE001 - shown on the screen, never hidden
            self._readings_until_setup = SETUP_RETRY_READINGS
            with self._state.lock:
                self._series().judge.failed(f"The reference could not be set up: {error}")
            return
        self._reference_ready = True

    def _decide(self, sample_time: datetime) -> None:
        case = {
            "sensor": self.sensor,
            "next_sample_time": sample_time.isoformat(),
            "samples": list(self._samples),
        }
        try:
            decision = self._site.decide(SENSOR_TASK, case)
        except Exception as error:  # noqa: BLE001 - shown on the screen, never hidden
            with self._state.lock:
                self._series().judge.failed(f"The decision failed: {error}")
            return
        with self._state.lock:
            self._series().judge.succeeded(
                {
                    "phase": "judging",
                    "label": decision.label,
                    "confidence": decision.confidence,
                    "attributes": decision.attributes or {},
                    "decision_id": decision.id,
                }
            )
        record_decision(
            self._state,
            self._site,
            decision,
            source=self.sensor,
            detail={"value_now": self._samples[-1], "window": self._samples[-120:]},
        )
