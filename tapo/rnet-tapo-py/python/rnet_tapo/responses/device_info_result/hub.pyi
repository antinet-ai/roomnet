from rnet_tapo.responses.device_info_result.device_info_ext import DeviceInfoSmartExt
from rnet_tapo.to_dict_ext import ToDictExt

class DeviceInfoHubResult(DeviceInfoSmartExt, ToDictExt):
    """Device info of Tapo H100 and H110."""

    in_alarm: bool
    in_alarm_source: str
    nickname: str
    overheated: bool
