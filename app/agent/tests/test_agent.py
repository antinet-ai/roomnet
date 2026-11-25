import subprocess
from pathlib import Path

import pytest

from rnet_agent import settings as settings_module
from rnet_agent.camera import _jpeg_size, stream_ended_message
from rnet_agent.problems import device_problem
from rnet_agent.series import WINDOW_LENGTH, SeriesJudge
from rnet_agent.state import HomeState
from rnet_agent.tapo_devices import WrongDevice, check_model

FULL_ENVIRONMENT = {
    "HOME_SITE_DIR": "/tmp/site",
    "ANET_HOME_ENGINEER": "engineer",
    "ANET_HOME_ENGINEER_PASSWORD": "engineer-secret",
    "ANET_HOME_OPERATOR": "operator",
    "ANET_HOME_OPERATOR_PASSWORD": "operator-secret",
    "CAMERA_HOST": "192.168.1.20",
    "CAMERA_USER": "cam user",
    "CAMERA_PASSWORD": "p@ss/word",
    "PLUG_HOST": "192.168.1.21",
    "HUB_HOST": "192.168.1.22",
    "BULB_HOST": "192.168.1.23",
    "DOOR_SENSOR": "front door",
    "MOTION_SENSOR": "hall",
    "CLIMATE_SENSOR": "living room",
    "TAPO_USERNAME": "someone@example.com",
    "TAPO_PASSWORD": "tapo-secret",
}


DEVICE_NAMES = (
    "CAMERA_HOST",
    "CAMERA_USER",
    "CAMERA_PASSWORD",
    "PLUG_HOST",
    "HUB_HOST",
    "BULB_HOST",
    "DOOR_SENSOR",
    "MOTION_SENSOR",
    "CLIMATE_SENSOR",
    "TAPO_USERNAME",
    "TAPO_PASSWORD",
)


def prepare(monkeypatch, tmp_path: Path, devices: dict[str, str]) -> None:
    for name, value in FULL_ENVIRONMENT.items():
        if name not in DEVICE_NAMES:
            monkeypatch.setenv(name, value)
    monkeypatch.setenv("HOME_SITE_DIR", str(tmp_path))
    (tmp_path / "devices.env").write_text("".join(f"{name}={value}\n" for name, value in devices.items()))


def test_a_missing_variable_stops_the_agent_with_its_name(monkeypatch, tmp_path):
    devices = {name: FULL_ENVIRONMENT[name] for name in DEVICE_NAMES if name != "TAPO_PASSWORD"}
    prepare(monkeypatch, tmp_path, devices)
    with pytest.raises(SystemExit, match="TAPO_PASSWORD"):
        settings_module.load()


def test_dollar_signs_and_quotes_in_the_devices_file_are_taken_literally(monkeypatch, tmp_path):
    devices = {name: FULL_ENVIRONMENT[name] for name in DEVICE_NAMES}
    devices["CAMERA_PASSWORD"] = "Name$$123"
    devices["TAPO_PASSWORD"] = "'quoted $HOME'"
    prepare(monkeypatch, tmp_path, devices)
    loaded = settings_module.load()
    assert loaded.camera_password == "Name$$123"
    assert loaded.tapo_password == "quoted $HOME"


def test_credentials_are_quoted_in_the_url_and_kept_out_of_the_repr(monkeypatch, tmp_path):
    prepare(monkeypatch, tmp_path, {name: FULL_ENVIRONMENT[name] for name in DEVICE_NAMES})
    loaded = settings_module.load()
    assert loaded.camera_url == "rtsp://cam%20user:p%40ss%2Fword@192.168.1.20:554/stream2"
    for secret in ("p@ss/word", "tapo-secret", "engineer-secret", "operator-secret"):
        assert secret not in repr(loaded)


def test_the_frame_size_is_read_from_the_jpeg_header(tmp_path: Path):
    frame = tmp_path / "frame.jpg"
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=gray:s=320x180",
         "-frames:v", "1", str(frame)],
        check=True,
    )
    assert _jpeg_size(frame.read_bytes()) == (320, 180)


def test_a_missing_hub_setting_stops_the_agent_with_its_name(monkeypatch, tmp_path):
    devices = {name: FULL_ENVIRONMENT[name] for name in DEVICE_NAMES if name != "CLIMATE_SENSOR"}
    prepare(monkeypatch, tmp_path, devices)
    with pytest.raises(SystemExit, match="CLIMATE_SENSOR"):
        settings_module.load()


def test_another_model_at_a_configured_address_is_named():
    check_model("The device at 192.168.0.10", "P115", "P115")
    with pytest.raises(WrongDevice) as refused:
        check_model("The device at 192.168.0.29", "H100", "P115")
    assert str(refused.value) == "The device at 192.168.0.29 is model H100, not the P115 this setting expects."


class RecordingSite:
    """Stands in for anet in the window logic only; the real service is
    exercised by the example's run."""

    def __init__(self):
        self.references: dict[str, list[float]] = {}
        self.cases: list[dict] = []

    def add_sensor_reference(self, sensor, reference):
        self.references[sensor] = reference

    def decide(self, task, case):
        self.cases.append(case)
        raise RuntimeError("no decision in this test")


def test_each_sensor_takes_its_own_reference_then_sends_windows():
    from datetime import datetime, timezone

    state, site = HomeState(), RecordingSite()
    temperature = SeriesJudge("room-temperature", "Temperature", "°C", 4, state, site)
    humidity = SeriesJudge("room-humidity", "Humidity", "%", 4, state, site)
    at = datetime(2026, 11, 20, tzinfo=timezone.utc)
    for index in range(WINDOW_LENGTH - 1):
        temperature.add(20.0 + (index % 3) * 0.1, at)
        humidity.add(50.0 + index % 2, at)
    assert site.references == {}
    assert state.series["room-temperature"].judge.value == {"phase": "reference", "held": 512, "needed": 513}
    temperature.add(20.0, at)
    humidity.add(50.0, at)
    assert set(site.references) == {"room-temperature", "room-humidity"}
    assert site.references["room-temperature"] != site.references["room-humidity"]
    assert [case["sensor"] for case in site.cases] == ["room-temperature", "room-humidity"]
    assert all(len(case["samples"]) == WINDOW_LENGTH for case in site.cases)
    assert state.series["room-temperature"].judge.error == "The decision failed: no decision in this test"


def test_a_flat_reference_starts_again():
    from datetime import datetime, timezone

    state, site = HomeState(), RecordingSite()
    flat = SeriesJudge("still", "Still", "", 4, state, site)
    for _ in range(WINDOW_LENGTH):
        flat.add(1.0, datetime(2026, 11, 20, tzinfo=timezone.utc))
    assert site.references == {}
    assert "did not change at all" in state.series["still"].judge.error


def test_bulb_settings_outside_the_bulbs_ranges_are_refused():
    from pydantic import ValidationError

    from rnet_agent.controls import BrightnessBody, ColourBody, SirenBody, TimerBody, WhiteBody

    assert BrightnessBody(brightness=1).brightness == 1
    assert ColourBody(hue=360, saturation=100).hue == 360
    assert WhiteBody(kelvin=2500).kelvin == 2500
    for refused in (
        lambda: BrightnessBody(brightness=0),
        lambda: BrightnessBody(brightness=101),
        lambda: ColourBody(hue=361, saturation=50),
        lambda: ColourBody(hue=10, saturation=0),
        lambda: WhiteBody(kelvin=2499),
        lambda: WhiteBody(kelvin=6501),
        lambda: SirenBody(ringtone="Alarm1", volume="Normal", seconds=301),
        lambda: SirenBody(ringtone="Alarm1", volume="Loud", seconds=10),
        lambda: TimerBody(seconds=30, turn_on=False),
    ):
        with pytest.raises(ValidationError):
            refused()


def test_decision_actions_fit_their_source():
    from rnet_agent.controls import PLUG_SENSOR, actions_for

    assert actions_for("camera") == ["siren", "bulb_on"]
    assert actions_for(PLUG_SENSOR) == ["plug_off"]
    assert actions_for("antitemp-temperature") == []


def test_the_timeline_keeps_each_event_once_newest_first():
    state = HomeState()
    with state.lock:
        state.add_to_timeline("door-1", "2026-11-20T10:00:00+00:00", "door", "Door opened")
        state.add_to_timeline("door-2", "2026-11-20T10:05:00+00:00", "door", "Door closed")
        state.add_to_timeline("door-1", "2026-11-20T10:00:00+00:00", "door", "Door opened")
        state.add_to_timeline("motion-7", "2026-11-20T10:02:00+00:00", "motion", "Motion")
    assert [item["key"] for item in state.timeline] == ["door-2", "motion-7", "door-1"]
    for index in range(state.timeline.maxlen + 5):
        with state.lock:
            state.add_to_timeline(f"motion-{100 + index}", f"2026-11-21T00:{index // 60:02d}:{index % 60:02d}+00:00", "motion", "Motion")
    assert len(state.timeline) == state.timeline.maxlen
    assert len(state.timeline_keys) == state.timeline.maxlen


def test_the_door_turns_the_light_off_only_when_a_person_switched_the_automation_on():
    import asyncio

    from rnet_agent.automation import DoorLightsOff
    from rnet_agent.hub import Hub

    class FakeBulb:
        def __init__(self):
            self.switched: list[bool] = []

        def switch(self, on):
            self.switched.append(on)

    state, bulb = HomeState(), FakeBulb()
    automation = DoorLightsOff(state, bulb, "antiguard")
    hub = Hub.__new__(Hub)
    hub._newest_door_event = None
    hub._on_door_opened = automation.door_opened

    def read(events):
        asyncio.run(hub._answer_new_openings(events))

    old = [{"id": 5, "event": "Open", "time": "2026-11-20T10:00:00+00:00"}]
    read(old)
    assert bulb.switched == []  # the log as it stood at start is never acted on
    read([{"id": 6, "event": "Open", "time": "2026-11-20T10:01:00+00:00"}, *old])
    assert bulb.switched == []  # off by default
    automation.set_enabled(True)
    opened = {"id": 7, "event": "Open", "time": "2026-11-20T10:02:00+00:00"}
    read([opened, *old])
    read([opened, *old])
    read([{"id": 8, "event": "Close", "time": "2026-11-20T10:03:00+00:00"}, opened])
    assert bulb.switched == [False]  # once per opening, never for a close
    assert state.door_lights_off["last_run"] == opened["time"]
    assert any("because antiguard opened" in item["text"] for item in state.timeline)


@pytest.mark.parametrize(
    ("ffmpeg_error", "expected_start"),
    [
        ("[tcp @ 0x1] Connection to tcp://192.168.0.29:554 failed: Host is down", "The camera can't be reached"),
        ("[tcp @ 0x1] Connection to tcp://192.168.0.29:554 failed: Operation timed out", "The camera can't be reached"),
        ("[rtsp @ 0x1] method DESCRIBE failed: 401 Unauthorized", "The camera turned down"),
        ("[tcp @ 0x1] Connection to tcp://192.168.0.29:554 failed: Connection refused", "The camera refused"),
        ("[h264 @ 0x1] decode_slice_header error", "The camera stream ended."),
        (None, "The camera stream ended."),
    ],
)
def test_stream_ended_message_names_the_cause(ffmpeg_error, expected_start):
    assert stream_ended_message(ffmpeg_error).startswith(expected_start)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (
            'Http(reqwest::Error { kind: Request, url: "http://192.168.0.10/", source: ConnectError("tcp connect error", '
            'Os { code: 64, kind: Uncategorized, message: "Host is down" }) })',
            "The bulb can't be reached on the network.",
        ),
        ("ConnectError(Os { code: 61, kind: ConnectionRefused, message: \"Connection refused\" })", "The bulb refused the connection."),
        ("The device at 192.168.0.10 is model L530, not the P115 this setting expects.", "The bulb could not be read: The device at 192.168.0.10 is model L530, not the P115 this setting expects."),
    ],
)
def test_device_problem_reads_as_one_plain_sentence(raw, expected):
    assert device_problem("bulb", raw) == expected
