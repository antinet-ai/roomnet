use pyo3::prelude::*;
use rnet_tapo::T100Handler;
use rnet_tapo::responses::T100Result;

use crate::responses::TriggerLogsT100Result;

py_child_handler! {
    PyT100Handler(T100Handler, T100Result),
    py_name = "T100Handler",
    trigger_logs = TriggerLogsT100Result,
    firmware,
}
