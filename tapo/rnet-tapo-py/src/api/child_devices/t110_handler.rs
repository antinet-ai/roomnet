use pyo3::prelude::*;
use rnet_tapo::T110Handler;
use rnet_tapo::responses::T110Result;

use crate::responses::TriggerLogsT110Result;

py_child_handler! {
    PyT110Handler(T110Handler, T110Result),
    py_name = "T110Handler",
    trigger_logs = TriggerLogsT110Result,
    firmware,
}
