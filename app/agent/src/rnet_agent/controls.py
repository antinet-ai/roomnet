"""What a person may ask the devices for over the screen, with the ranges
each device takes (specs/0078, MORE-10 to MORE-12 and MORE-15). A value
outside its range is refused before anything reaches a device."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# The L530's ranges, from the device's local interface.
BRIGHTNESS_RANGE = (1, 100)
HUE_RANGE = (0, 360)
SATURATION_RANGE = (1, 100)
WHITE_RANGE_KELVIN = (2500, 6500)
SIREN_LONGEST_SECONDS = 300
# A timer the plug carries out itself; a day is the longest offered.
TIMER_LONGEST_SECONDS = 24 * 60 * 60

# The plug's power as a sensor: the name its windows carry in anet.
PLUG_SENSOR = "plug-power"

SirenVolume = Literal["Low", "Normal", "High"]
DecisionAction = Literal["siren", "bulb_on", "plug_off"]


class SwitchBody(BaseModel):
    on: bool


class BrightnessBody(BaseModel):
    brightness: int = Field(ge=BRIGHTNESS_RANGE[0], le=BRIGHTNESS_RANGE[1])


class ColourBody(BaseModel):
    hue: int = Field(ge=HUE_RANGE[0], le=HUE_RANGE[1])
    saturation: int = Field(ge=SATURATION_RANGE[0], le=SATURATION_RANGE[1])


class WhiteBody(BaseModel):
    kelvin: int = Field(ge=WHITE_RANGE_KELVIN[0], le=WHITE_RANGE_KELVIN[1])


class SirenBody(BaseModel):
    ringtone: str
    volume: SirenVolume
    seconds: int = Field(ge=1, le=SIREN_LONGEST_SECONDS)


class TimerBody(BaseModel):
    seconds: int = Field(ge=60, le=TIMER_LONGEST_SECONDS)
    turn_on: bool


class DecisionActionBody(BaseModel):
    action: DecisionAction


def actions_for(source: str) -> list[DecisionAction]:
    """The device actions that fit a decision's source: a camera decision
    can sound the siren or light the room; the plug's power, switch the
    plug off. The others have none."""
    if source == "camera":
        return ["siren", "bulb_on"]
    if source == PLUG_SENSOR:
        return ["plug_off"]
    return []


# What a decision action does when a person takes it from a card.
DECISION_SIREN = SirenBody(ringtone="Alarm1", volume="Normal", seconds=10)
