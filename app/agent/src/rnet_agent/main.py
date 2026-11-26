"""Starts the agent: the anet connections, the object task, the camera,
the plug, the hub and its sensors, the bulb and the local API."""

from __future__ import annotations

import logging
import threading

import uvicorn
from rnet_tapo import ApiClient

from . import settings as settings_module
from .anet_site import AnetSite
from .automation import DoorLightsOff
from .bulb import Bulb
from .camera import Camera
from .hub import Hub
from .plug import Plug
from .server import build
from .state import HomeState
from .watch import build_watch


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    # One line per request at one decision a second buries the agent's own messages.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    settings = settings_module.load()
    state = HomeState()
    site = AnetSite(settings)
    site.prepare_object_task()
    camera = Camera(settings.camera_url, settings.camera_host, state, site)
    tapo = ApiClient(settings.tapo_username, settings.tapo_password)
    plug = Plug(settings.plug_host, tapo, state, site)
    bulb = Bulb(settings.bulb_host, tapo, state)
    door_lights_off = DoorLightsOff(state, bulb, settings.door_sensor)
    hub = Hub(
        settings.hub_host,
        settings.door_sensor,
        settings.motion_sensor,
        settings.climate_sensor,
        tapo,
        state,
        site,
        door_lights_off.door_opened,
    )
    camera.start()
    plug.start()
    hub.start()
    bulb.start()
    if settings.watch_token:
        # The watch reaches the agent over WiFi, so this one listens on the
        # local network; build_watch refuses any request without the token.
        watch_server = uvicorn.Server(
            uvicorn.Config(
                build_watch(state, bulb, plug, settings.watch_token),
                host="0.0.0.0",
                port=settings.watch_port,
                log_level="warning",
            )
        )
        state.watch["port"] = settings.watch_port
        threading.Thread(target=watch_server.run, name="watch-api", daemon=True).start()
        logging.getLogger(__name__).info("watch API on port %d", settings.watch_port)
    try:
        # The live streams never end on their own; after a stop signal the
        # server gives them two seconds, then closes them.
        uvicorn.run(
            build(state, site, plug, bulb, hub, door_lights_off),
            host="127.0.0.1",
            port=settings.listen_port,
            log_level="warning",
            timeout_graceful_shutdown=2,
        )
    finally:
        camera.stop()


if __name__ == "__main__":
    main()
