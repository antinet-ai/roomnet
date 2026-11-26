import pytest
from fastapi.testclient import TestClient

from rnet_agent import settings as settings_module
from rnet_agent.state import HomeState
from rnet_agent.watch import build_watch

from test_agent import DEVICE_NAMES, FULL_ENVIRONMENT, prepare

TOKEN = "t" * 40


class FakeBulb:
    def __init__(self, error=None):
        self.calls = []
        self.error = error

    def _call(self, *call):
        if self.error:
            raise self.error
        self.calls.append(call)

    def switch(self, on):
        self._call("switch", on)

    def set_colour(self, hue, saturation):
        self._call("colour", hue, saturation)

    def set_white(self, kelvin):
        self._call("white", kelvin)


def client(state=None, bulb=None):
    state = state or HomeState()
    bulb = bulb or FakeBulb()
    app = build_watch(state, bulb, TOKEN)
    return TestClient(app, headers={"Authorization": f"Bearer {TOKEN}"}), state, bulb


def test_a_request_without_the_token_is_refused():
    test_client, state, bulb = client()
    assert state.watch["enabled"] is True
    for authorization in ("", "Bearer wrong", TOKEN):
        response = test_client.post("/watch/bulb", json={"on": True}, headers={"Authorization": authorization})
        assert response.status_code == 401
    assert bulb.calls == []
    assert state.watch["last_seen"] is None


def test_the_screen_learns_when_the_watch_last_called():
    test_client, state, _ = client()
    test_client.get("/watch/state")
    assert state.watch["last_seen"] is not None
    assert state.watch["address"] == "testclient"


def test_the_watch_switches_the_light_and_sets_its_colour_and_the_timeline_says_so():
    test_client, state, bulb = client()
    assert test_client.post("/watch/bulb", json={"on": True}).status_code == 200
    assert test_client.post("/watch/bulb/colour", json={"hue": 200, "saturation": 100}).status_code == 200
    assert test_client.post("/watch/bulb/white", json={"kelvin": 2700}).status_code == 200
    assert bulb.calls == [("switch", True), ("colour", 200, 100), ("white", 2700)]
    texts = [item["text"] for item in state.timeline]
    assert "Bulb turned on from the watch" in texts
    assert "Bulb set to blue from the watch" in texts
    assert "Bulb set to 2700 K white from the watch" in texts


def test_the_watch_reaches_nothing_but_the_light():
    test_client, *_ = client()
    assert test_client.post("/watch/plug", json={"on": False}).status_code == 404
    assert test_client.post("/watch/bulb/brightness", json={"brightness": 50}).status_code == 404


def test_a_colour_outside_the_bulbs_range_never_reaches_it():
    test_client, _, bulb = client()
    assert test_client.post("/watch/bulb/colour", json={"hue": 400, "saturation": 100}).status_code == 422
    assert test_client.post("/watch/bulb/white", json={"kelvin": 9000}).status_code == 422
    assert bulb.calls == []


def test_a_device_failure_comes_back_as_a_sentence():
    test_client, state, _ = client(bulb=FakeBulb(error=RuntimeError("timed out")))
    response = test_client.post("/watch/bulb", json={"on": True})
    assert response.status_code == 502
    assert "bulb" in response.json()["detail"]
    assert list(state.timeline) == []


def test_the_state_carries_the_lights_colour_or_its_problem():
    state = HomeState()
    state.bulb.succeeded({"on": True, "brightness": 70, "hue": 30, "saturation": 100, "kelvin": None})
    test_client, *_ = client(state=state)
    assert test_client.get("/watch/state").json() == {
        "bulb": {"on": True, "hue": 30, "saturation": 100, "kelvin": None, "problem": None}
    }
    state.bulb.failed("The bulb did not answer.")
    assert test_client.get("/watch/state").json()["bulb"]["problem"] == "The bulb did not answer."


def devices_with(**extra):
    return {name: FULL_ENVIRONMENT[name] for name in DEVICE_NAMES} | extra


def test_the_watch_api_is_off_without_a_token(monkeypatch, tmp_path):
    prepare(monkeypatch, tmp_path, devices_with())
    assert settings_module.load().watch_token is None


def test_a_short_watch_token_stops_the_agent(monkeypatch, tmp_path):
    prepare(monkeypatch, tmp_path, devices_with(WATCH_TOKEN="short"))
    with pytest.raises(SystemExit, match="WATCH_TOKEN"):
        settings_module.load()
