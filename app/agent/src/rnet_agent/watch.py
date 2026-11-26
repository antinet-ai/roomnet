"""The watch's API: the bulb and the plug, and nothing else, on the local
network for roomnet's T-Watch (watch/). The screen's API stays on
127.0.0.1; this one listens only when WATCH_TOKEN is set, and every request
carries that token."""

from __future__ import annotations

import hmac

from fastapi import Depends, FastAPI, Header, HTTPException, Request

from .bulb import Bulb
from .controls import BrightnessBody, SwitchBody
from .plug import Plug
from .server import _device_call
from .state import HomeState, now


def _device(source) -> dict:
    """What the watch shows for one device: its last reading, or why
    there is none."""
    value = source.value or {}
    return {
        "on": value.get("on"),
        "brightness": value.get("brightness"),
        "watts": value.get("watts"),
        "problem": source.error,
    }


def build_watch(state: HomeState, bulb: Bulb, plug: Plug, token: str) -> FastAPI:
    def check_token(request: Request, authorization: str = Header(default="")) -> None:
        scheme, _, given = authorization.partition(" ")
        if scheme != "Bearer" or not hmac.compare_digest(given.encode(), token.encode()):
            raise HTTPException(401, "This watch is not paired with roomnet.")
        with state.lock:
            state.watch["last_seen"] = now().isoformat()
            state.watch["address"] = request.client.host if request.client else None

    with state.lock:
        state.watch["enabled"] = True

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, dependencies=[Depends(check_token)])

    def done(what: str) -> None:
        taken_at = now().isoformat()
        with state.lock:
            state.add_to_timeline(f"watch-{what}-{taken_at}", taken_at, "you", f"{what} from the watch")

    @app.get("/watch/state")
    def read_state() -> dict:
        with state.lock:
            return {"bulb": _device(state.bulb), "plug": _device(state.plug)}

    @app.post("/watch/bulb")
    def switch_bulb(body: SwitchBody) -> None:
        _device_call("bulb", lambda: bulb.switch(body.on))
        done("Bulb turned on" if body.on else "Bulb turned off")

    @app.post("/watch/bulb/brightness")
    def set_bulb_brightness(body: BrightnessBody) -> None:
        _device_call("bulb", lambda: bulb.set_brightness(body.brightness))
        done(f"Bulb set to {body.brightness}%")

    @app.post("/watch/plug")
    def switch_plug(body: SwitchBody) -> None:
        _device_call("plug", lambda: plug.switch(body.on))
        done("Plug switched on" if body.on else "Plug switched off")

    return app
