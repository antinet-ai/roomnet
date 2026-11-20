"""The one automation a person can switch on: when the door opens, the
bulb turns off. It is off until a person turns it on, and every run is on
the timeline (specs/0078, MORE-17)."""

from __future__ import annotations

from .bulb import Bulb
from .state import HomeState, now


class DoorLightsOff:
    def __init__(self, state: HomeState, bulb: Bulb, door_name: str):
        self._state = state
        self._bulb = bulb
        self._door_name = door_name

    def set_enabled(self, enabled: bool) -> None:
        """Called only from a person's switch on the screen."""
        with self._state.lock:
            self._state.door_lights_off.update({"enabled": enabled, "error": None})
            changed = "on" if enabled else "off"
            at = now().isoformat()
            self._state.add_to_timeline(f"automation-{at}", at, "you", f"Door lights-off automation turned {changed} by you")

    def door_opened(self, event_id: int, event_time: str) -> None:
        """Called from the hub's worker for each new Open event, never for
        events that were in the log when the agent started."""
        with self._state.lock:
            if not self._state.door_lights_off["enabled"]:
                return
        try:
            self._bulb.switch(False)
        except Exception as error:  # noqa: BLE001 - shown on the screen, never hidden
            with self._state.lock:
                self._state.door_lights_off["error"] = f"The bulb did not turn off when the door opened: {error}"
            return
        with self._state.lock:
            self._state.door_lights_off.update({"last_run": event_time, "error": None})
            self._state.add_to_timeline(
                f"automation-door-{event_id}",
                event_time,
                "automation",
                f"Light turned off because {self._door_name} opened · automation",
            )
