"""Everything the agent is started with, read once from the environment.
A missing value stops the agent with the variable's name."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote


def _required(name: str, source: dict[str, str] | None = None) -> str:
    value = (os.environ if source is None else source).get(name, "")
    if not value:
        where = "the environment" if source is None else "the devices file"
        raise SystemExit(f"rnet-agent: {name} is not set in {where}")
    return value


def read_devices_file(path: Path) -> dict[str, str]:
    """`NAME=value` lines taken literally: no shell expansion, so a `$` in a
    password stays a `$` (a shell's `source` turns `$$` into its process
    number). One pair of matching quotes around a value is removed."""
    values: dict[str, str] = {}
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        name, separator, value = stripped.partition("=")
        if not separator or not name.strip().isidentifier():
            raise SystemExit(f"rnet-agent: {path} line {number} is not NAME=value")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[name.strip()] = value
    return values


@dataclass(frozen=True)
class Settings:
    anet_socket: str
    engineer: str
    engineer_password: str
    operator: str
    operator_password: str
    camera_host: str
    camera_user: str
    camera_password: str
    plug_host: str
    hub_host: str
    bulb_host: str
    door_sensor: str
    motion_sensor: str
    climate_sensor: str
    tapo_username: str
    tapo_password: str
    listen_port: int

    @property
    def camera_url(self) -> str:
        # The low-quality stream is enough for a 640-pixel detector and
        # keeps decoding cheap.
        user = quote(self.camera_user, safe="")
        password = quote(self.camera_password, safe="")
        return f"rtsp://{user}:{password}@{self.camera_host}:554/stream2"

    def __repr__(self) -> str:
        return (
            f"Settings(camera_host={self.camera_host!r}, plug_host={self.plug_host!r}, "
            f"hub_host={self.hub_host!r}, bulb_host={self.bulb_host!r})"
        )


def load() -> Settings:
    site = Path(_required("HOME_SITE_DIR"))
    devices = read_devices_file(site / "devices.env")
    return Settings(
        anet_socket=str(site / "run" / "anet.sock"),
        engineer=_required("ANET_HOME_ENGINEER"),
        engineer_password=_required("ANET_HOME_ENGINEER_PASSWORD"),
        operator=_required("ANET_HOME_OPERATOR"),
        operator_password=_required("ANET_HOME_OPERATOR_PASSWORD"),
        camera_host=_required("CAMERA_HOST", devices),
        camera_user=_required("CAMERA_USER", devices),
        camera_password=_required("CAMERA_PASSWORD", devices),
        plug_host=_required("PLUG_HOST", devices),
        hub_host=_required("HUB_HOST", devices),
        bulb_host=_required("BULB_HOST", devices),
        door_sensor=_required("DOOR_SENSOR", devices),
        motion_sensor=_required("MOTION_SENSOR", devices),
        climate_sensor=_required("CLIMATE_SENSOR", devices),
        tapo_username=_required("TAPO_USERNAME", devices),
        tapo_password=_required("TAPO_PASSWORD", devices),
        listen_port=int(os.environ.get("HOME_AGENT_PORT", "8787")),
    )
