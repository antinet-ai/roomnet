"""The watch's API: the light's switch and colour, and nothing else, on the
local network for roomnet's T-Watch (watch/). The screen's API stays on
127.0.0.1; this one listens only when WATCH_TOKEN is set, and every request
carries that token."""

from __future__ import annotations

import hmac

from fastapi import Depends, FastAPI, Header, HTTPException, Request

from .bulb import Bulb
from .controls import ColourBody, SwitchBody, WhiteBody
from .server import _device_call
from .state import HomeState, now

# The names the timeline gives the colours the watch offers.
COLOUR_NAMES = {0: "red", 30: "amber", 120: "green", 200: "blue"}


def _colour_name(hue: int) -> str:
    return COLOUR_NAMES.get(hue, f"hue {hue}")


def build_watch(state: HomeState, bulb: Bulb, token: str) -> FastAPI:
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
            value = state.bulb.value or {}
            return {
                "bulb": {
                    "on": value.get("on"),
                    "hue": value.get("hue"),
                    "saturation": value.get("saturation"),
                    # Null while the bulb shows a colour.
                    "kelvin": value.get("kelvin"),
                    "problem": state.bulb.error,
                }
            }

    @app.post("/watch/bulb")
    def switch_bulb(body: SwitchBody) -> None:
        _device_call("bulb", lambda: bulb.switch(body.on))
        done("Bulb turned on" if body.on else "Bulb turned off")

    @app.post("/watch/bulb/colour")
    def set_bulb_colour(body: ColourBody) -> None:
        _device_call("bulb", lambda: bulb.set_colour(body.hue, body.saturation))
        done(f"Bulb set to {_colour_name(body.hue)}")

    @app.post("/watch/bulb/white")
    def set_bulb_white(body: WhiteBody) -> None:
        _device_call("bulb", lambda: bulb.set_white(body.kelvin))
        done(f"Bulb set to {body.kelvin} K white")

    return app
