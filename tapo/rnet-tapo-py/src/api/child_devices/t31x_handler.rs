use std::ops::Deref;

use pyo3::prelude::*;
use rnet_tapo::T31XHandler;
use rnet_tapo::responses::{T31XResult, TemperatureHumidityRecords};

use crate::call_handler_method;

py_child_handler! {
    PyT31XHandler(T31XHandler, T31XResult),
    py_name = "T31XHandler",
    firmware,
}

#[pymethods]
impl PyT31XHandler {
    pub async fn get_temperature_humidity_records(&self) -> PyResult<TemperatureHumidityRecords> {
        let handler = self.inner.clone();
        call_handler_method!(
            handler.deref(),
            T31XHandler::get_temperature_humidity_records
        )
    }
}
