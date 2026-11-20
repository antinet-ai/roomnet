from typing import Union

from rnet_tapo.responses.device_info_result.default_plug_state import Custom, LastStates
from rnet_tapo.responses.device_info_result.device_info_ext import DeviceInfoSmartExt
from rnet_tapo.to_dict_ext import ToDictExt

class DeviceInfoPlugResult(DeviceInfoSmartExt, ToDictExt):
    """Device info of Tapo P100, P105, P125, P125M and TP10."""

    default_states: Union[LastStates, Custom]
    device_on: bool
    nickname: str
    on_time: int
    """The time in seconds this device has been ON since the last state change (On/Off)."""
