"""The power plug over its local protocol: its power once a second, judged
as its own sensor by anet's sensor-pattern task, and on or off only when a
person asks."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from rnet_tapo import ApiClient
from rnet_tapo.responses import PowerState

from .anet_site import AnetSite
from .controls import PLUG_SENSOR
from .problems import device_problem
from .series import SeriesJudge
from .state import HomeState
from .tapo_devices import DeviceLoop, check_model

SAMPLE_INTERVAL_SECONDS = 1.0
DECISION_EVERY_SAMPLES = 5
RECONNECT_DELAY_SECONDS = 5.0
PLUG_MODEL = "P115"
# The timer is read every few readings; a person's change reads it at once.
TIMER_EVERY_SAMPLES = 5


class Plug:
    def __init__(self, host: str, client: ApiClient, state: HomeState, site: AnetSite):
        self._host = host
        self._client = client
        self._state = state
        self._loop = DeviceLoop("plug")
        self._device = None
        self._timer: dict | None = None
        self._samples_until_timer = 0
        self._power = SeriesJudge(PLUG_SENSOR, "Power", "W", DECISION_EVERY_SAMPLES, state, site)

    def start(self) -> None:
        self._loop.start(self._sample_forever())

    def switch(self, on: bool) -> None:
        """The one place the plug changes state, called only from the
        person's tap on the screen."""
        self._loop.run(self._switch(on))

    def set_timer(self, seconds: int, turn_on: bool) -> None:
        """The plug's own countdown, set only from a person's action; the
        plug carries it out (specs/0078, MORE-12)."""
        state = PowerState.On if turn_on else PowerState.Off
        self._loop.run(self._timer_change(lambda device: device.set_timer(seconds, state)))

    def clear_timer(self) -> None:
        self._loop.run(self._timer_change(lambda device: device.clear_timer()))

    async def _timer_change(self, call) -> None:
        device = await self._connected()
        await call(device)
        await self._read_timer(device)

    async def _read_timer(self, device) -> None:
        timer = await device.get_timer()
        self._timer = (
            None
            if timer is None
            else {"remaining_s": timer.remaining_s, "turn_on": timer.desired_state == PowerState.On}
        )

    async def _connected(self):
        if self._device is None:
            device = await self._client.p115(self._host)
            # Read raw, before the typed read, which fails on another
            # model's reply with a message that does not say why.
            info = await device.get_device_info_json()
            check_model(f"The device at {self._host}", info.get("model", ""), PLUG_MODEL)
            self._device = device
        return self._device

    async def _switch(self, on: bool) -> None:
        device = await self._connected()
        if on:
            await device.on()
        else:
            await device.off()

    async def _sample_forever(self) -> None:
        while True:
            try:
                device = await self._connected()
                info = await device.get_device_info()
                usage = await device.get_energy_usage()
                if self._samples_until_timer <= 0:
                    await self._read_timer(device)
                    self._samples_until_timer = TIMER_EVERY_SAMPLES
                self._samples_until_timer -= 1
            except Exception as error:  # noqa: BLE001 - shown on the screen, never hidden
                self._device = None
                with self._state.lock:
                    self._state.plug.failed(device_problem("plug", error))
                await asyncio.sleep(RECONNECT_DELAY_SECONDS)
                continue
            if usage.current_power is None:
                with self._state.lock:
                    self._state.plug.failed("The plug did not report its power.")
                await asyncio.sleep(SAMPLE_INTERVAL_SECONDS)
                continue
            watts = usage.current_power / 1000.0
            with self._state.lock:
                self._state.plug.succeeded(
                    {
                        "on": info.device_on,
                        "name": info.nickname,
                        "model": info.model,
                        "watts": watts,
                        "today_wh": usage.today_energy,
                        "month_wh": usage.month_energy,
                        "today_minutes": usage.today_runtime,
                        "timer": self._timer,
                    }
                )
            await asyncio.to_thread(self._power.add, watts, datetime.now(timezone.utc))
            await asyncio.sleep(SAMPLE_INTERVAL_SECONDS)
