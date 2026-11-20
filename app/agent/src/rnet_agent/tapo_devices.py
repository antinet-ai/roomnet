"""What every Tapo device here shares: one event loop thread for its
library calls, and the check that the device at a configured address is
the model that setting expects (specs/0078, MORE-7)."""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Coroutine
from typing import Any, TypeVar

Result = TypeVar("Result")

# How long a person's switch tap waits for the device.
SWITCH_TIMEOUT_SECONDS = 10.0


class WrongDevice(RuntimeError):
    """A different device answered at a configured address, as when the
    router hands a device's address to a new one."""

    def __init__(self, where: str, answered: str, expected: str):
        super().__init__(f"{where} is model {answered}, not the {expected} this setting expects.")


def check_model(where: str, answered: str, expected: str) -> None:
    if answered != expected:
        raise WrongDevice(where, answered or "unknown", expected)


class DeviceLoop:
    """An event loop on its own thread, for one device's library calls."""

    def __init__(self, name: str):
        self._loop = asyncio.new_event_loop()
        self._name = name

    def start(self, forever: Coroutine[Any, Any, None]) -> None:
        threading.Thread(target=self._loop.run_forever, name=self._name, daemon=True).start()
        asyncio.run_coroutine_threadsafe(forever, self._loop)

    def run(self, call: Coroutine[Any, Any, Result]) -> Result:
        """Runs `call` on the loop from another thread and waits for it."""
        return asyncio.run_coroutine_threadsafe(call, self._loop).result(timeout=SWITCH_TIMEOUT_SECONDS)
