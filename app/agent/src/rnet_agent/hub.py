"""The hub and its three sensors over the local protocol, read every 16
seconds, the interval they report at: the door's contact and the motion
sensor are shown as events and go to no task (specs/0078, MORE-5); the
temperature and the humidity are each judged as their own sensor
(MORE-4). The hub's siren plays only when a person starts it (MORE-11)."""

from __future__ import annotations

import asyncio
import base64
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from rnet_tapo import ApiClient
from rnet_tapo.requests import AlarmDuration, AlarmRingtone, AlarmVolume

from .anet_site import AnetSite
from .series import SeriesJudge
from .state import HomeState, SourceState
from .controls import SirenBody
from .tapo_devices import DeviceLoop, check_model

READ_INTERVAL_SECONDS = 16.0
# The door is read more often than the others, so the automation that
# answers it acts within a couple of seconds of the door opening.
DOOR_READ_INTERVAL_SECONDS = 2.0
RECONNECT_DELAY_SECONDS = 5.0
EVENTS_SHOWN = 5
# A reading every 16 s; four readings are about a minute between decisions.
DECISION_EVERY_READINGS = 4
HUB_MODEL = "H100"
DOOR_MODEL = "T110"
MOTION_MODEL = "T100"
CLIMATE_MODEL = "T315"
# The sensor keeps its record at 15-minute steps; reading it every 56
# readings (about 15 minutes) keeps it current.
CLIMATE_RECORD_EVERY_READINGS = 56
# Sorted as a person reads them, so "DoorbellRing10" comes after "DoorbellRing9".
RINGTONES = sorted(
    (name for name in dir(AlarmRingtone) if not name.startswith("_")),
    key=lambda name: (name.rstrip("0123456789"), int(name[len(name.rstrip("0123456789")) :] or 0)),
)
EVENT_WORDS = {"Open": "opened", "Close": "closed", "KeepOpen": "left open", "Motion": "Motion"}


def _events(logs: Any) -> list[dict[str, Any]]:
    # The library's event names read `T110Event.Open`; the screen shows `Open`.
    return [
        {"id": log.id, "event": str(log.event).rsplit(".", 1)[-1], "time": log.triggered_at.isoformat()}
        for log in logs.logs
    ]


def _child_fields(info: Any) -> dict[str, Any]:
    return {"name": info.nickname, "model": info.model, "battery_low": info.at_low_battery}


class Hub:
    def __init__(
        self,
        host: str,
        door_name: str,
        motion_name: str,
        climate_name: str,
        client: ApiClient,
        state: HomeState,
        site: AnetSite,
        on_door_opened: Callable[[int, str], None],
    ):
        self._host = host
        self._on_door_opened = on_door_opened
        # The newest door event already seen; None until the first read,
        # which takes the log as it stands and acts on none of it.
        self._newest_door_event: int | None = None
        self._door_name = door_name
        self._motion_name = motion_name
        self._climate_name = climate_name
        self._client = client
        self._state = state
        self._loop = DeviceLoop("hub")
        self._hub = None
        self._readings_until_record = 0
        self._temperature = SeriesJudge(
            f"{climate_name}-temperature", "Temperature", "°C", DECISION_EVERY_READINGS, state, site
        )
        self._humidity = SeriesJudge(
            f"{climate_name}-humidity", "Humidity", "%", DECISION_EVERY_READINGS, state, site
        )

    def start(self) -> None:
        self._loop.start(self._read_forever())

    def play_siren(self, siren: SirenBody) -> None:
        """Called only from a person's action on the screen."""
        if siren.ringtone not in RINGTONES:
            raise ValueError(f"The hub has no ringtone named {siren.ringtone}.")
        self._loop.run(self._play(siren))

    def stop_siren(self) -> None:
        self._loop.run(self._stop())

    async def _play(self, siren: SirenBody) -> None:
        hub = await self._connected()
        await hub.play_alarm(
            getattr(AlarmRingtone, siren.ringtone),
            getattr(AlarmVolume, siren.volume),
            AlarmDuration.Seconds,
            seconds=siren.seconds,
        )
        await self._read_hub(hub)

    async def _stop(self) -> None:
        hub = await self._connected()
        await hub.stop_alarm()
        await self._read_hub(hub)

    async def _read_hub(self, hub) -> None:
        info = await hub.get_device_info_json()
        # The raw device info carries the nickname base64-encoded; the
        # library's typed reads decode it, this one does not.
        name = base64.b64decode(info.get("nickname", "")).decode("utf-8")
        with self._state.lock:
            self._state.hub.succeeded(
                {"name": name, "model": HUB_MODEL, "in_alarm": bool(info.get("in_alarm")), "ringtones": RINGTONES}
            )

    async def _connected(self):
        if self._hub is None:
            hub = await self._client.h100(self._host)
            info = await hub.get_device_info_json()
            check_model(f"The device at {self._host}", info.get("model", ""), HUB_MODEL)
            self._hub = hub
        return self._hub

    async def _watch_door_forever(self) -> None:
        while True:
            if self._hub is not None:
                await self._read_child(self._state.door, "door sensor", self._read_door(self._hub))
            await asyncio.sleep(DOOR_READ_INTERVAL_SECONDS)

    async def _read_forever(self) -> None:
        asyncio.get_running_loop().create_task(self._watch_door_forever())
        while True:
            try:
                hub = await self._connected()
            except Exception as error:  # noqa: BLE001 - shown on the screen, never hidden
                self._hub = None
                message = f"The hub could not be reached: {error}"
                with self._state.lock:
                    self._state.hub.failed(message)
                self._temperature.failed(message)
                self._humidity.failed(message)
                await asyncio.sleep(RECONNECT_DELAY_SECONDS)
                continue
            try:
                await self._read_hub(hub)
            except Exception as error:  # noqa: BLE001 - shown on the screen, never hidden
                self._hub = None
                with self._state.lock:
                    self._state.hub.failed(f"The hub could not be read: {error}")
                await asyncio.sleep(RECONNECT_DELAY_SECONDS)
                continue
            # Each sensor is read on its own, so one with a flat battery
            # leaves the others' readings on the screen.
            await self._read_child(self._state.motion, "motion sensor", self._read_motion(hub))
            climate_ok = await self._read_child(self._state.climate, "climate sensor", self._read_climate(hub))
            if climate_ok:
                await self._read_climate_record(hub)
            else:
                with self._state.lock:
                    error = self._state.climate.error or ""
                self._temperature.failed(error)
                self._humidity.failed(error)
            await asyncio.sleep(READ_INTERVAL_SECONDS)

    async def _read_child(self, source: SourceState, what: str, read) -> bool:
        try:
            value = await read
        except Exception as error:  # noqa: BLE001 - shown on the screen, never hidden
            with self._state.lock:
                source.failed(f"The {what} could not be read: {error}")
            return False
        with self._state.lock:
            source.succeeded(value)
            if value["battery_low"]:
                source.failed(f"The {what}'s battery is low.")
        return True

    def _add_events(self, source: str, name: str, events: list[dict[str, Any]]) -> None:
        with self._state.lock:
            for event in events:
                word = EVENT_WORDS.get(event["event"], event["event"])
                text = word if source == "motion" else f"Door {word}"
                self._state.add_to_timeline(
                    f"{source}-{event['id']}", event["time"], source, f"{text} · {name}"
                )

    async def _answer_new_openings(self, events: list[dict[str, Any]]) -> None:
        newest = max((event["id"] for event in events), default=0)
        if self._newest_door_event is None:
            self._newest_door_event = newest
            return
        openings = [
            event for event in events if event["id"] > self._newest_door_event and event["event"] == "Open"
        ]
        self._newest_door_event = max(newest, self._newest_door_event)
        for event in sorted(openings, key=lambda item: item["id"]):
            await asyncio.to_thread(self._on_door_opened, event["id"], event["time"])

    async def _read_climate_record(self, hub) -> None:
        if self._readings_until_record > 0:
            self._readings_until_record -= 1
            return
        try:
            climate = await hub.t31x(nickname=self._climate_name)
            record = await climate.get_temperature_humidity_records()
        except Exception as error:  # noqa: BLE001 - shown on the screen, never hidden
            with self._state.lock:
                self._state.climate_record.failed(f"The climate sensor's 24-hour record could not be read: {error}")
            return
        self._readings_until_record = CLIMATE_RECORD_EVERY_READINGS
        with self._state.lock:
            self._state.climate_record.succeeded(
                [
                    {"time": item.recorded_at.isoformat(), "temperature": item.temperature, "humidity": item.humidity}
                    for item in record.records
                ]
            )

    async def _read_door(self, hub) -> dict[str, Any]:
        door = await hub.t110(nickname=self._door_name)
        info = await door.get_device_info()
        check_model(f"The hub sensor {self._door_name}", info.model, DOOR_MODEL)
        events = _events(await door.get_trigger_logs(EVENTS_SHOWN))
        self._add_events("door", info.nickname, events)
        await self._answer_new_openings(events)
        return {**_child_fields(info), "open": info.open, "events": events}

    async def _read_motion(self, hub) -> dict[str, Any]:
        motion = await hub.t100(nickname=self._motion_name)
        info = await motion.get_device_info()
        check_model(f"The hub sensor {self._motion_name}", info.model, MOTION_MODEL)
        events = _events(await motion.get_trigger_logs(EVENTS_SHOWN))
        self._add_events("motion", info.nickname, events)
        return {**_child_fields(info), "detected": info.detected, "events": events}

    async def _read_climate(self, hub) -> dict[str, Any]:
        climate = await hub.t31x(nickname=self._climate_name)
        info = await climate.get_device_info()
        check_model(f"The hub sensor {self._climate_name}", info.model, CLIMATE_MODEL)
        temperature = float(info.current_temperature)
        humidity = float(info.current_humidity)
        sample_time = datetime.now(timezone.utc)
        await asyncio.to_thread(self._temperature.add, temperature, sample_time)
        await asyncio.to_thread(self._humidity.add, humidity, sample_time)
        return {**_child_fields(info), "temperature": temperature, "humidity": humidity}
