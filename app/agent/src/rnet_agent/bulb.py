"""The bulb over its local protocol: its state read every few seconds, and
on, off, brightness, colour or white temperature only when a person sets
them (specs/0078, MORE-6 and MORE-10)."""

from __future__ import annotations

import asyncio

from rnet_tapo import ApiClient

from .state import HomeState
from .problems import device_problem
from .tapo_devices import DeviceLoop, check_model

READ_INTERVAL_SECONDS = 5.0
BULB_MODEL = "L530"


class Bulb:
    def __init__(self, host: str, client: ApiClient, state: HomeState):
        self._host = host
        self._client = client
        self._state = state
        self._loop = DeviceLoop("bulb")
        self._device = None

    def start(self) -> None:
        self._loop.start(self._read_forever())

    # The only places the bulb changes, each called from a person's action
    # on the screen; after each, the bulb's own state is read back so the
    # screen shows what the bulb did (MORE-16).
    def switch(self, on: bool) -> None:
        self._loop.run(self._change(lambda device: device.on() if on else device.off()))

    def set_brightness(self, brightness: int) -> None:
        self._loop.run(self._change(lambda device: device.set_brightness(brightness)))

    def set_colour(self, hue: int, saturation: int) -> None:
        self._loop.run(self._change(lambda device: device.set_hue_saturation(hue, saturation)))

    def set_white(self, kelvin: int) -> None:
        self._loop.run(self._change(lambda device: device.set_color_temperature(kelvin)))

    async def _connected(self):
        if self._device is None:
            device = await self._client.l530(self._host)
            info = await device.get_device_info_json()
            check_model(f"The device at {self._host}", info.get("model", ""), BULB_MODEL)
            self._device = device
        return self._device

    async def _change(self, call) -> None:
        device = await self._connected()
        await call(device)
        await self._read(device)

    async def _read(self, device) -> None:
        info = await device.get_device_info()
        with self._state.lock:
            self._state.bulb.succeeded(
                {
                    "on": info.device_on,
                    "name": info.nickname,
                    "model": info.model,
                    "brightness": info.brightness,
                    # The bulb reports a white temperature of 0 while it
                    # shows a colour, and its hue and saturation then.
                    "hue": info.hue,
                    "saturation": info.saturation,
                    "kelvin": info.color_temp or None,
                }
            )

    async def _read_forever(self) -> None:
        while True:
            try:
                await self._read(await self._connected())
            except Exception as error:  # noqa: BLE001 - shown on the screen, never hidden
                self._device = None
                with self._state.lock:
                    self._state.bulb.failed(device_problem("bulb", error))
            await asyncio.sleep(READ_INTERVAL_SECONDS)
