import pytest
from fastapi.testclient import TestClient

from rnet_agent import settings as settings_module
from rnet_agent.state import HomeState
from rnet_agent.watch import build_watch

from test_agent import DEVICE_NAMES, FULL_ENVIRONMENT, prepare

TOKEN = "t" * 40


class FakeBulb:
    def __init__(self):
        self.calls = []

    def switch(self, on):
        self.calls.append(("switch", on))

    def set_brightness(self, brightness):
        self.calls.append(("brightness", brightness))


class FakePlug:
    def __init__(self, error=None):
        self.calls = []
        self.error = error

    def switch(self, on):
        if self.error:
            raise self.error
        self.calls.append(("switch", on))


def client(state=None, plug=None):
    state = state or HomeState()
    bulb, plug = FakeBulb(), plug or FakePlug()
    app = build_watch(state, bulb, plug, TOKEN)
    return TestClient(app, headers={"Authorization": f"Bearer {TOKEN}"}), state, bulb, plug


def test_a_request_without_the_token_is_refused():
    test_client, state, bulb, _ = client()
    assert state.watch["enabled"] is True
    for authorization in ("", "Bearer wrong", TOKEN):
        response = test_client.post("/watch/bulb", json={"on": True}, headers={"Authorization": authorization})
        assert response.status_code == 401
    assert bulb.calls == []
    assert state.watch["last_seen"] is None


def test_the_screen_learns_when_the_watch_last_called():
    test_client, state, *_ = client()
    test_client.get("/watch/state")
    assert state.watch["last_seen"] is not None
    assert state.watch["address"] == "testclient"


def test_the_watch_switches_the_bulb_and_the_plug_and_the_timeline_says_so():
    test_client, state, bulb, plug = client()
    assert test_client.post("/watch/bulb", json={"on": True}).status_code == 200
    assert test_client.post("/watch/bulb/brightness", json={"brightness": 40}).status_code == 200
    assert test_client.post("/watch/plug", json={"on": False}).status_code == 200
    assert bulb.calls == [("switch", True), ("brightness", 40)]
    assert plug.calls == [("switch", False)]
    texts = [item["text"] for item in state.timeline]
    assert "Bulb turned on from the watch" in texts
    assert "Plug switched off from the watch" in texts


def test_a_brightness_outside_the_bulbs_range_never_reaches_it():
    test_client, _, bulb, _ = client()
    assert test_client.post("/watch/bulb/brightness", json={"brightness": 0}).status_code == 422
    assert bulb.calls == []


def test_a_device_failure_comes_back_as_a_sentence():
    test_client, state, _, _ = client(plug=FakePlug(error=RuntimeError("timed out")))
    response = test_client.post("/watch/plug", json={"on": True})
    assert response.status_code == 502
    assert "plug" in response.json()["detail"]
    assert list(state.timeline) == []


def test_the_state_carries_each_devices_reading_or_its_problem():
    state = HomeState()
    state.bulb.succeeded({"on": True, "brightness": 70})
    state.plug.failed("The plug did not report its power.")
    test_client, *_ = client(state=state)
    body = test_client.get("/watch/state").json()
    assert body["bulb"] == {"on": True, "brightness": 70, "watts": None, "problem": None}
    assert body["plug"]["on"] is None
    assert body["plug"]["problem"] == "The plug did not report its power."


def devices_with(**extra):
    return {name: FULL_ENVIRONMENT[name] for name in DEVICE_NAMES} | extra


def test_the_watch_api_is_off_without_a_token(monkeypatch, tmp_path):
    prepare(monkeypatch, tmp_path, devices_with())
    assert settings_module.load().watch_token is None


def test_a_short_watch_token_stops_the_agent(monkeypatch, tmp_path):
    prepare(monkeypatch, tmp_path, devices_with(WATCH_TOKEN="short"))
    with pytest.raises(SystemExit, match="WATCH_TOKEN"):
        settings_module.load()
