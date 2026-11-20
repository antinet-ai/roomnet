use pyo3::prelude::*;
use rnet_tapo::HubHandler;
use rnet_tapo::responses::DeviceInfoHubResult;

py_handler! {
    PyHubHandler(HubHandler, DeviceInfoHubResult),
    py_name = "HubHandler",
    device_management,
}

py_hub_alarm_handlers!(PyHubHandler, HubHandler);

py_hub_child_handlers!(PyHubHandler, HubHandler, ChildDeviceHubResult);
