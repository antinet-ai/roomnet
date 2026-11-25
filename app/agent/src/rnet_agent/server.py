"""The local HTTP API the screen reads, on 127.0.0.1 only."""

from __future__ import annotations

import json
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from .anet_site import AnetSite
from .automation import DoorLightsOff
from .bulb import Bulb
from .controls import (
    DECISION_SIREN,
    BrightnessBody,
    ColourBody,
    DecisionActionBody,
    SirenBody,
    SwitchBody,
    TimerBody,
    WhiteBody,
)
from .decisions import frame_for
from .hub import Hub
from .plug import Plug
from .problems import device_problem
from .state import HomeState, now

STREAM_BOUNDARY = "frame"
# How long a stream waits for news before checking it again; a client that
# went away is noticed on the next write.
STREAM_WAIT_SECONDS = 2.0


class ActionBody(BaseModel):
    action: Literal["confirm", "dismiss"]


def _device_call(what: str, call) -> None:
    """Runs a person's device action; a device's refusal goes back to the
    person in one sentence (MORE-16)."""
    try:
        call()
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except Exception as error:  # noqa: BLE001 - returned to the person
        raise HTTPException(502, device_problem(what, error, "did not do it")) from error


def build(
    state: HomeState, site: AnetSite, plug: Plug, bulb: Bulb, hub: Hub, door_lights_off: DoorLightsOff
) -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    # Every device change below is reached only from a person's action on
    # the screen; nothing in the agent calls these on its own.
    decision_actions = {
        "siren": ("siren", lambda: hub.play_siren(DECISION_SIREN), "Siren sounded"),
        "bulb_on": ("bulb", lambda: bulb.switch(True), "Bulb turned on"),
        "plug_off": ("plug", lambda: plug.switch(False), "Plug switched off"),
    }

    @app.get("/api/state")
    def read_state() -> dict:
        with state.lock:
            return {
                "camera": state.camera.as_json(),
                "detection": state.detection.as_json(),
                "plug": state.plug.as_json(),
                "hub": state.hub.as_json(),
                "door": state.door.as_json(),
                "motion": state.motion.as_json(),
                "climate": state.climate.as_json(),
                "bulb": state.bulb.as_json(),
                "climate_record": state.climate_record.as_json(),
                "door_lights_off": dict(state.door_lights_off),
                "series": {sensor: series.as_json() for sensor, series in state.series.items()},
                "timeline": [dict(item) for item in state.timeline],
                "pending": sum(
                    1 for item in state.decisions if item["to_person"] and item["action"] is None
                ),
            }

    @app.get("/api/decisions")
    def read_decisions() -> list[dict]:
        with state.lock:
            return [dict(item) for item in state.decisions]

    @app.post("/api/decisions/{decision_id}/action")
    def act(decision_id: str, body: ActionBody) -> dict:
        entry = state.find_decision(decision_id)
        if entry is None:
            raise HTTPException(404, "No such decision on this screen.")
        try:
            site.act(entry["task"], decision_id, body.action)
        except Exception as error:  # noqa: BLE001 - returned to the person
            raise HTTPException(502, f"anet did not record the action: {error}") from error
        with state.lock:
            entry["action"] = body.action
        return dict(entry)

    @app.post("/api/decisions/{decision_id}/device-action")
    def decision_device_action(decision_id: str, body: DecisionActionBody) -> dict:
        entry = state.find_decision(decision_id)
        if entry is None:
            raise HTTPException(404, "No such decision on this screen.")
        if body.action not in entry["device_actions"]:
            raise HTTPException(400, f"{body.action} does not fit a decision from {entry['source']}.")
        what, call, done = decision_actions[body.action]
        _device_call(what, call)
        taken_at = now().isoformat()
        with state.lock:
            entry["device_actions_taken"].append(body.action)
            state.add_to_timeline(
                f"action-{decision_id}-{body.action}-{taken_at}", taken_at, "you", f"{done} by you", decision_id
            )
        return dict(entry)

    @app.get("/api/decisions/{decision_id}/frame.jpg")
    def decision_frame(decision_id: str) -> Response:
        frame = frame_for(decision_id)
        if frame is None:
            raise HTTPException(404, "No frame is kept for this decision.")
        return Response(frame, media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.get("/api/camera/frame.jpg")
    def camera_frame() -> Response:
        with state.lock:
            frame = state.frame_jpeg
        if frame is None:
            raise HTTPException(503, "No frame has come from the camera yet.")
        return Response(frame, media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.get("/api/camera/stream")
    def camera_stream() -> StreamingResponse:
        """Every frame as it arrives, as MJPEG."""

        def frames():
            seen = (-1, -1)
            sent_frame = -1
            while True:
                seen = state.wait_for_change(seen, STREAM_WAIT_SECONDS)
                with state.lock:
                    frame = state.frame_jpeg
                    sequence = state.frame_sequence
                if frame is None or sequence == sent_frame:
                    continue
                sent_frame = sequence
                yield (
                    f"--{STREAM_BOUNDARY}\r\nContent-Type: image/jpeg\r\n"
                    f"Content-Length: {len(frame)}\r\n\r\n"
                ).encode() + frame + b"\r\n"

        return StreamingResponse(
            frames(),
            media_type=f"multipart/x-mixed-replace; boundary={STREAM_BOUNDARY}",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    @app.get("/api/detections/stream")
    def detection_stream() -> StreamingResponse:
        """Every detection as server-sent events, as soon as anet answers."""

        def events():
            seen = (-1, -1)
            sent_detection = -1
            yield ": open\n\n"
            while True:
                before = seen
                seen = state.wait_for_change(seen, STREAM_WAIT_SECONDS)
                with state.lock:
                    detection = state.detection.value
                    sequence = state.detection_sequence
                if detection is None or sequence == sent_detection:
                    if seen == before:
                        # A comment line keeps the connection open while
                        # nothing happens, and finds a client that left.
                        yield ": waiting\n\n"
                    continue
                sent_detection = sequence
                yield f"data: {json.dumps(detection)}\n\n"

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    @app.post("/api/plug")
    def switch_plug(body: SwitchBody) -> None:
        _device_call("plug", lambda: plug.switch(body.on))

    @app.post("/api/plug/timer")
    def set_plug_timer(body: TimerBody) -> None:
        _device_call("plug", lambda: plug.set_timer(body.seconds, body.turn_on))

    @app.delete("/api/plug/timer")
    def clear_plug_timer() -> None:
        _device_call("plug", plug.clear_timer)

    @app.post("/api/bulb")
    def switch_bulb(body: SwitchBody) -> None:
        _device_call("bulb", lambda: bulb.switch(body.on))

    @app.post("/api/bulb/brightness")
    def set_bulb_brightness(body: BrightnessBody) -> None:
        _device_call("bulb", lambda: bulb.set_brightness(body.brightness))

    @app.post("/api/bulb/colour")
    def set_bulb_colour(body: ColourBody) -> None:
        _device_call("bulb", lambda: bulb.set_colour(body.hue, body.saturation))

    @app.post("/api/bulb/white")
    def set_bulb_white(body: WhiteBody) -> None:
        _device_call("bulb", lambda: bulb.set_white(body.kelvin))

    @app.post("/api/siren")
    def play_siren(body: SirenBody) -> None:
        _device_call("siren", lambda: hub.play_siren(body))

    @app.post("/api/automations/door-lights-off")
    def switch_door_lights_off(body: SwitchBody) -> None:
        door_lights_off.set_enabled(body.on)

    @app.delete("/api/siren")
    def stop_siren() -> None:
        _device_call("siren", hub.stop_siren)

    return app
